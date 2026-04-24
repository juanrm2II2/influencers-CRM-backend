import { Request, Response } from 'express';
import { SupabaseClient } from '@supabase/supabase-js';
import { logger } from '../logger';
import {
  upsertConsent,
  getConsents,
  createDsarRequest,
  getDsarRequests,
  updateDsarStatus,
  exportUserData,
  eraseUserData,
  purgeExpiredData,
} from '../services/privacy';
import { ConsentRequestBody, DsarRequestType, DsarStatus } from '../types';

/** Log server-side and return a generic error to the client. */
function handleError(res: Response, err: unknown, context: string): void {
  logger.error({ context, err }, `Error in ${context}`);
  res.status(500).json({ error: 'Internal server error' });
}

/**
 * Resolve the per-request RLS-scoped Supabase client attached by the
 * `authenticate` middleware.  Returns `null` and writes a 401 when missing.
 */
function getScoped(req: { scopedClient?: SupabaseClient; user?: { sub: string } }, res: Response): SupabaseClient | null {
  const client = req.scopedClient;
  if (!client || !req.user?.sub) {
    res.status(401).json({ error: 'Authentication required' });
    return null;
  }
  return client;
}

// ---------------------------------------------------------------------------
// Consent management
// ---------------------------------------------------------------------------

/** GET /api/privacy/consent — list all consent records for the authenticated user */
export async function listConsents(req: Request, res: Response): Promise<void> {
  try {
    const client = getScoped(req, res);
    if (!client) return;
    const userId = req.user!.sub;
    const consents = await getConsents(client, userId);
    res.json({ data: consents });
  } catch (err) {
    handleError(res, err, 'listConsents');
  }
}

/** POST /api/privacy/consent — grant or revoke consent */
export async function updateConsent(
  req: Request<object, object, ConsentRequestBody>,
  res: Response
): Promise<void> {
  try {
    const client = getScoped(req, res);
    if (!client) return;
    const userId = req.user!.sub;
    const { consent_type, granted } = req.body;

    const result = await upsertConsent(client, userId, consent_type, granted, req.ip);

    if (!result) {
      res.status(500).json({ error: 'Failed to update consent' });
      return;
    }

    res.status(200).json(result);
  } catch (err) {
    handleError(res, err, 'updateConsent');
  }
}

// ---------------------------------------------------------------------------
// DSAR endpoints
// ---------------------------------------------------------------------------

/** GET /api/privacy/requests — list DSAR requests for the authenticated user */
export async function listDsarRequests(
  req: Request,
  res: Response
): Promise<void> {
  try {
    const client = getScoped(req, res);
    if (!client) return;
    const userId = req.user!.sub;
    const requests = await getDsarRequests(client, userId);
    res.json({ data: requests });
  } catch (err) {
    handleError(res, err, 'listDsarRequests');
  }
}

/** POST /api/privacy/requests — create a new DSAR request */
export async function createDsar(
  req: Request<object, object, { request_type: DsarRequestType }>,
  res: Response
): Promise<void> {
  try {
    const client = getScoped(req, res);
    if (!client) return;
    const userId = req.user!.sub;
    const userEmail = req.user!.email;
    const { request_type } = req.body;

    const result = await createDsarRequest(client, userId, userEmail, request_type);

    if (!result) {
      res.status(500).json({ error: 'Failed to create request' });
      return;
    }

    res.status(201).json(result);
  } catch (err) {
    handleError(res, err, 'createDsar');
  }
}

/** PATCH /api/privacy/requests/:id — update DSAR status (admin only) */
export async function updateDsar(
  req: Request<{ id: string }, object, { status: DsarStatus; notes?: string }>,
  res: Response
): Promise<void> {
  try {
    const { id } = req.params;
    const { status, notes } = req.body;

    const result = await updateDsarStatus(id, status, notes);

    if (!result) {
      res.status(404).json({ error: 'Request not found' });
      return;
    }

    res.json(result);
  } catch (err) {
    handleError(res, err, 'updateDsar');
  }
}

// ---------------------------------------------------------------------------
// Data export (portability)
// ---------------------------------------------------------------------------

/** GET /api/privacy/export — export all user data */
export async function exportData(
  req: Request,
  res: Response
): Promise<void> {
  try {
    const userId = req.user!.sub;
    const data = await exportUserData(userId);

    res.setHeader('Content-Type', 'application/json');
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="user-data-export-${new Date().toISOString().slice(0, 10)}.json"`
    );
    res.json(data);
  } catch (err) {
    handleError(res, err, 'exportData');
  }
}

// ---------------------------------------------------------------------------
// Right to erasure
// ---------------------------------------------------------------------------

/** DELETE /api/privacy/data — erase all personal data */
export async function eraseData(
  req: Request,
  res: Response
): Promise<void> {
  try {
    const userId = req.user!.sub;
    const result = await eraseUserData(userId);

    if (result.errors.length > 0) {
      logger.error({ errors: result.errors, userId }, 'Partial erasure failure');
      res.status(207).json({
        message: 'Data erasure partially completed',
        ...result,
      });
      return;
    }

    res.json({
      message: 'All personal data has been erased',
      ...result,
    });
  } catch (err) {
    handleError(res, err, 'eraseData');
  }
}

// ---------------------------------------------------------------------------
// Data retention (admin)
// ---------------------------------------------------------------------------

/** POST /api/privacy/purge — trigger data retention purge (admin only) */
export async function purgeData(
  req: Request,
  res: Response
): Promise<void> {
  try {
    const results = await purgeExpiredData();
    res.json({ message: 'Data retention purge completed', results });
  } catch (err) {
    handleError(res, err, 'purgeData');
  }
}
