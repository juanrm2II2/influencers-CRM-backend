import { supabase } from './supabase';
import { logger } from '../logger';

/**
 * Audit log entry structure.
 * Corresponds to the `audit_log` table in Supabase.
 *
 * SQL to create the table:
 * ```sql
 * CREATE TABLE audit_log (
 *   id          UUID DEFAULT gen_random_uuid() PRIMARY KEY,
 *   actor_id    TEXT NOT NULL,
 *   actor_email TEXT,
 *   action      TEXT NOT NULL,
 *   resource    TEXT NOT NULL,
 *   resource_id TEXT,
 *   before_state JSONB,
 *   after_state  JSONB,
 *   ip_address  TEXT,
 *   created_at  TIMESTAMPTZ DEFAULT now()
 * );
 *
 * CREATE INDEX idx_audit_log_actor ON audit_log(actor_id);
 * CREATE INDEX idx_audit_log_resource ON audit_log(resource, resource_id);
 * CREATE INDEX idx_audit_log_created ON audit_log(created_at);
 * ```
 */
export interface AuditLogEntry {
  actor_id: string;
  actor_email?: string;
  action: string;
  resource: string;
  resource_id?: string;
  before_state?: Record<string, unknown>;
  after_state?: Record<string, unknown>;
  ip_address?: string;
}

/**
 * Records an audit log entry to the `audit_log` table.
 *
 * This function is intentionally fire-and-forget — audit logging failures
 * should not block the main request/response cycle. Errors are logged
 * but not propagated.
 */
export async function recordAuditLog(entry: AuditLogEntry): Promise<void> {
  try {
    const { error } = await supabase.from('audit_log').insert({
      actor_id: entry.actor_id,
      actor_email: entry.actor_email ?? null,
      action: entry.action,
      resource: entry.resource,
      resource_id: entry.resource_id ?? null,
      before_state: entry.before_state ?? null,
      after_state: entry.after_state ?? null,
      ip_address: entry.ip_address ?? null,
    });

    if (error) {
      logger.error({ err: error, entry }, 'Failed to write audit log');
    }
  } catch (err) {
    logger.error({ err, entry }, 'Failed to write audit log');
  }
}
