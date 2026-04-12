import { Request, Response } from 'express';
import { logger } from '../logger';
import {
  initiateVerification,
  getKycByUserId,
  syncVerificationStatus,
} from '../services/kyc';

/** Log server-side and return a generic error to the client. */
function handleError(res: Response, err: unknown, context: string): void {
  logger.error({ context, err }, `Error in ${context}`);
  res.status(500).json({ error: 'Internal server error' });
}

/**
 * POST /api/kyc/verify
 *
 * Initiates KYC verification for the authenticated user.
 * Body: { country: string, id_doc_type: string }
 */
export async function verifyKyc(
  req: Request<object, object, { country: string; id_doc_type: string }>,
  res: Response
): Promise<void> {
  try {
    const userId = req.user!.sub;
    const { country, id_doc_type } = req.body;

    const record = await initiateVerification(userId, country, id_doc_type);

    res.status(201).json({
      kyc_status: record.kyc_status,
      applicant_id: record.applicant_id,
      message:
        record.kyc_status === 'verified'
          ? 'KYC already verified'
          : 'KYC verification initiated',
    });
  } catch (err: unknown) {
    if (err instanceof Error && err.message === 'KYC provider error') {
      res.status(502).json({ error: 'KYC provider is unavailable, please try again later' });
      return;
    }
    handleError(res, err, 'verifyKyc');
  }
}

/**
 * GET /api/kyc/status/:userId
 *
 * Returns the current KYC status for a given user.
 * Admins can query any user; regular users can only query themselves.
 */
export async function getKycStatus(
  req: Request<{ userId: string }>,
  res: Response
): Promise<void> {
  try {
    const requestedUserId = req.params.userId;
    const callerUserId = req.user!.sub;
    const callerRole = req.user!.role;

    // Non-admin users may only check their own status
    if (callerRole !== 'admin' && callerUserId !== requestedUserId) {
      res.status(403).json({ error: 'You can only view your own KYC status' });
      return;
    }

    // Try to sync with provider first (best-effort)
    let record;
    try {
      record = await syncVerificationStatus(requestedUserId);
    } catch {
      // Fallback to local record
      record = await getKycByUserId(requestedUserId);
    }

    if (!record) {
      res.json({ kyc_status: 'pending', message: 'No KYC verification initiated' });
      return;
    }

    res.json({
      kyc_status: record.kyc_status,
      applicant_id: record.applicant_id,
      verified_at: record.verified_at,
      rejection_reason: record.rejection_reason,
    });
  } catch (err: unknown) {
    handleError(res, err, 'getKycStatus');
  }
}
