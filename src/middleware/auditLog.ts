import { Request, Response, NextFunction } from 'express';
import { recordAuditLog } from '../services/auditLog';
import { logger } from '../logger';

/**
 * Set of HTTP methods considered state-changing and worth auditing.
 */
const AUDITABLE_METHODS = new Set(['POST', 'PATCH', 'PUT', 'DELETE']);

/**
 * Express middleware that records audit log entries for all state-changing
 * operations (POST, PATCH, PUT, DELETE).
 *
 * Captures:
 * - Actor identity (from req.user, set by auth middleware)
 * - Timestamp (handled by database default)
 * - Action (HTTP method + path)
 * - Request body as "after_state" (for creates/updates)
 * - IP address
 *
 * Must be placed after the authenticate middleware so that req.user is available.
 */
export function auditLog(
  req: Request,
  res: Response,
  next: NextFunction
): void {
  if (!AUDITABLE_METHODS.has(req.method)) {
    next();
    return;
  }

  // Capture the original res.json to intercept response body
  const originalJson = res.json.bind(res);

  res.json = function (body: unknown) {
    // Fire-and-forget audit log recording
    const actor = req.user;
    if (actor) {
      recordAuditLog({
        actor_id: actor.sub,
        actor_email: actor.email,
        action: `${req.method} ${req.originalUrl}`,
        resource: req.baseUrl || req.path,
        resource_id: typeof req.params.id === 'string' ? req.params.id : undefined,
        after_state:
          req.method === 'DELETE'
            ? undefined
            : (req.body as Record<string, unknown>),
        ip_address: req.ip,
      }).catch((err) => {
        logger.error({ err }, 'Audit log recording failed');
      });
    }

    return originalJson(body);
  };

  next();
}
