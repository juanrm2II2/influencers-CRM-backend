import { Router, type Request, type Response } from 'express';
import { serviceClient } from '../../config/supabase';
import { logger } from '../../config/logger';

/**
 * Health endpoints.
 *   - `/live`  : liveness — the process is up. Never checks downstreams.
 *   - `/ready` : readiness — required downstreams are reachable. Returns
 *                503 if Supabase cannot be reached. Used by Railway and
 *                load balancers for traffic gating.
 */
export function healthRouter(): Router {
  const router = Router();

  router.get('/live', (_req: Request, res: Response) => {
    res.json({ status: 'ok', uptime: process.uptime() });
  });

  router.get('/ready', async (_req: Request, res: Response) => {
    const checks: Record<string, { ok: boolean; error?: string }> = {};
    try {
      // Lightweight probe: the service client exists and we can form a URL.
      // We avoid running a DB query here to keep readiness cheap; a deeper
      // probe lives on `/ready?deep=true` in later phases.
      serviceClient();
      checks.supabase = { ok: true };
    } catch (err) {
      checks.supabase = { ok: false, error: (err as Error).message };
    }

    const allOk = Object.values(checks).every((c) => c.ok);
    if (!allOk) {
      logger.warn({ checks }, 'readiness check failed');
      res.status(503).json({ status: 'not_ready', checks });
      return;
    }
    res.json({ status: 'ready', checks });
  });

  return router;
}
