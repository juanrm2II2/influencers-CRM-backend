import { Request, Response, NextFunction } from 'express';
import { recordAuditLog } from '../services/auditLog';
import { logger } from '../logger';
import { anonymizeIp } from '../services/privacy';

/**
 * Set of HTTP methods considered state-changing and worth auditing.
 */
const AUDITABLE_METHODS = new Set(['POST', 'PATCH', 'PUT', 'DELETE']);

/**
 * Allow-list of body field names that are safe to persist into
 * `audit_log.after_state` (audit M3).
 *
 * The previous implementation stored the entire (sanitised) `req.body`.
 * That body routinely contains free-text PII — `notes`, `message_sent`,
 * `response`, scraped `bio` — which then survives a right-to-erasure
 * sweep because `eraseUserData` only anonymises `actor_id` /
 * `actor_email` / `ip_address` at the row level (audit M1/M3 link).
 *
 * The fields below are **categorical or operational metadata only**:
 *   - influencers / outreach: `handle`, `platform`, `status`, `niche`,
 *     `channel`, `contact_date`, `follow_up_date`
 *   - privacy: `consent_type`, `granted`, `request_type`
 *
 * Anything not in this list — notes, message bodies, scraped biographies,
 * URLs, free-form text — is dropped before the row is written.  Operators
 * can still see *which* operation occurred and on which categorical
 * dimensions; investigators who need the full payload should subpoena the
 * structured request log, which has a shorter retention window.
 */
const AFTER_STATE_ALLOWLIST: ReadonlySet<string> = new Set([
  'handle',
  'platform',
  'status',
  'niche',
  'channel',
  'contact_date',
  'follow_up_date',
  'consent_type',
  'granted',
  'request_type',
]);

/**
 * Project a request body down to the audit-log allow-list, dropping any
 * field whose name is not on `AFTER_STATE_ALLOWLIST`.  Returns `undefined`
 * when no whitelisted field is present so the JSONB column is left NULL
 * rather than being populated with `{}`.
 */
function redactAfterState(
  body: unknown
): Record<string, unknown> | undefined {
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    return undefined;
  }
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(body as Record<string, unknown>)) {
    if (AFTER_STATE_ALLOWLIST.has(key)) {
      out[key] = value;
    }
  }
  return Object.keys(out).length > 0 ? out : undefined;
}

/**
 * Fetch the current state of a resource from the database before a mutation.
 * Returns `undefined` when the resource cannot be identified or found.
 *
 * Uses the per-request RLS-scoped client (set by `authenticate`) so that
 * the audit-log "before-state" can never include a row that the caller
 * could not otherwise read.
 */
async function fetchBeforeState(
  req: Request
): Promise<Record<string, unknown> | undefined> {
  const id = req.params.id as string | undefined;
  if (!id) return undefined;

  const client = req.scopedClient;
  if (!client) return undefined;

  // Determine the table from the route path
  const basePath = req.baseUrl || '';
  let table: string | undefined;

  if (basePath.includes('/influencers')) {
    table = 'influencers';
  }

  if (!table) return undefined;

  try {
    const { data, error } = await client
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
 * - Allow-listed (non-PII) request fields as `after_state` (audit M3)
 * - IP address (anonymised — audit M9)
 *
 * Must be placed after the authenticate middleware so that req.user is available.
 *
 * Note: This middleware is async because it fetches before-state from the DB.
 * Express 5 natively supports async middleware and will forward rejections
 * to the error handler.
 */
export async function auditLog(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  if (!AUDITABLE_METHODS.has(req.method)) {
    next();
    return;
  }

  // Fetch before-state; on failure, continue without it
  let beforeState: Record<string, unknown> | undefined;
  try {
    beforeState = await fetchBeforeState(req);
  } catch (err) {
    logger.warn({ err }, 'Failed to capture before-state for audit log');
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
        before_state: beforeState,
        after_state:
          req.method === 'DELETE'
            ? undefined
            : redactAfterState(req.body),
        ip_address: anonymizeIp(req.ip) ?? undefined,
      }).catch((auditErr) => {
        logger.error({ err: auditErr }, 'Audit log recording failed');
      });
    }

    return originalJson(body);
  };

  next();
}
