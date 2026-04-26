import { Request, Response, NextFunction } from 'express';
import { logger } from '../logger';

/**
 * Middleware that verifies the authenticated user has granted
 * `data_processing` consent before allowing access to data-processing
 * endpoints.
 *
 * Must be placed **after** the `authenticate` middleware so that
 * `req.user` and `req.scopedClient` are populated.  Uses the per-request
 * RLS-scoped Supabase client so that one user cannot read another user's
 * consent rows.
 */
export async function requireConsent(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  const userId = req.user?.sub;
  const client = req.scopedClient;

  if (!userId || !client) {
    res.status(401).json({ error: 'Authentication required' });
    return;
  }

  try {
    const { data, error } = await client
      .from('consent')
      .select('granted')
      .eq('user_id', userId)
      .eq('consent_type', 'data_processing')
      .maybeSingle();

    if (error) {
      logger.error({ err: error }, 'Failed to check data_processing consent');
      res.status(500).json({ error: 'Internal server error' });
      return;
    }

    if (!data) {
      // Distinguish "never granted" from "granted then revoked" so UIs can
      // present the right call-to-action without leaking sensitive state
      // (audit L4).
      res.status(403).json({
        error: 'Data processing consent is required',
        error_code: 'CONSENT_MISSING',
      });
      return;
    }

    if (!data.granted) {
      res.status(403).json({
        error: 'Data processing consent is required',
        error_code: 'CONSENT_REVOKED',
      });
      return;
    }

    next();
  } catch (err) {
    logger.error({ err }, 'Consent check failed');
    res.status(500).json({ error: 'Internal server error' });
  }
}
