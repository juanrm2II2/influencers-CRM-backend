import { Request, Response, NextFunction } from 'express';
import { recordAuditLog } from '../services/auditLog';
import { supabase } from '../services/supabase';
import { logger } from '../logger';

/**
 * Set of HTTP methods considered state-changing and worth auditing.
 */
const AUDITABLE_METHODS = new Set(['POST', 'PATCH', 'PUT', 'DELETE']);

/**
 * Fetch the current state of a resource from the database before a mutation.
 * Returns `undefined` when the resource cannot be identified or found.
 */
async function fetchBeforeState(
  req: Request
): Promise<Record<string, unknown> | undefined> {
  const id = req.params.id as string | undefined;
  if (!id) return undefined;

  // Determine the table from the route path
  const basePath = req.baseUrl || '';
  let table: string | undefined;

  if (basePath.includes('/influencers')) {
    table = 'influencers';
  }

  if (!table) return undefined;

  try {
    const { data, error } = await supabase
      .from(table)
      .select('*')
      .eq('id', id)
      .maybeSingle();

    if (error || !data) return undefined;
    return data as Record<string, unknown>;
  } catch {
    return undefined;
  }
}

/**
 * Express middleware that records audit log entries for all state-changing
 * operations (POST, PATCH, PUT, DELETE).
 *
 * Captures:
 * - Actor identity (from req.user, set by auth middleware)
 * - Timestamp (handled by database default)
 * - Action (HTTP method + path)
 * - Before-state (current DB record, for updates/deletes)
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

  // Capture before-state asynchronously, then intercept the response
  fetchBeforeState(req)
    .then((beforeState) => {
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
            before_state: beforeState,
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
    })
    .catch((err) => {
      // If before-state capture fails, continue without it
      logger.warn({ err }, 'Failed to capture before-state for audit log');

      const originalJson = res.json.bind(res);

      res.json = function (body: unknown) {
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
          }).catch((auditErr) => {
            logger.error({ err: auditErr }, 'Audit log recording failed');
          });
        }

        return originalJson(body);
      };

      next();
    });
}
