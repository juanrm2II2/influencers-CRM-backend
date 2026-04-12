import { Request, Response, NextFunction } from 'express';
import { supabase } from '../services/supabase';
import { logger } from '../logger';

/**
 * Middleware that verifies the authenticated user has granted
 * `data_processing` consent before allowing access to data-processing
 * endpoints.
 *
 * Must be placed **after** the `authenticate` middleware so that
 * `req.user` is populated.
 */
export async function requireConsent(
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
    const { data, error } = await supabase
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

    if (!data || !data.granted) {
      res.status(403).json({ error: 'Data processing consent is required' });
      return;
    }

    next();
  } catch (err) {
    logger.error({ err }, 'Consent check failed');
    res.status(500).json({ error: 'Internal server error' });
  }
}
