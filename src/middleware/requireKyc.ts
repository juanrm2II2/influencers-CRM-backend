import { Request, Response, NextFunction } from 'express';
import { getKycByUserId } from '../services/kyc';
import { logger } from '../logger';

/**
 * Middleware that gates an endpoint behind KYC verification.
 *
 * Must be placed **after** the `authenticate` middleware so that `req.user`
 * is populated.
 *
 * Responds with 403 if the user's KYC status is not `verified`.
 */
export async function requireKyc(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  const userId = req.user?.sub;

  if (!userId) {
    res.status(401).json({ error: 'Authentication required' });
    return;
  }

  try {
    const record = await getKycByUserId(userId);

    if (!record || record.kyc_status !== 'verified') {
      res.status(403).json({
        error: 'KYC verification required',
        kyc_status: record?.kyc_status ?? 'pending',
      });
      return;
    }

    next();
  } catch (err) {
    logger.error({ err, userId }, 'requireKyc middleware error');
    // Fail closed — deny access when KYC status cannot be determined
    res.status(500).json({ error: 'Unable to verify KYC status' });
  }
}
