import { SupabaseClient } from '@supabase/supabase-js';
import { supabase } from './supabase';
import { recordAuditLog } from './auditLog';
import { logger } from '../logger';
import { ConsentType, DsarRequestType, DsarStatus } from '../types';

// ---------------------------------------------------------------------------
// Consent management
// ---------------------------------------------------------------------------

/**
 * Record or update a user's consent for a specific type.
 *
 * @param client - per-request RLS-scoped Supabase client (anon key + caller JWT)
 */
export async function upsertConsent(
  client: SupabaseClient,
  userId: string,
  consentType: ConsentType,
  granted: boolean,
  ipAddress?: string
): Promise<Record<string, unknown> | null> {
  const now = new Date().toISOString();
  const payload: Record<string, unknown> = {
    user_id: userId,
    consent_type: consentType,
    granted,
    updated_at: now,
  };

  if (granted) {
    payload.granted_at = now;
    payload.revoked_at = null;
  } else {
    payload.revoked_at = now;
  }

  if (ipAddress) {
    payload.ip_address = ipAddress;
  }

  const { data, error } = await client
    .from('consent')
    .upsert(payload, { onConflict: 'user_id,consent_type', ignoreDuplicates: false })
    .select()
    .single();

  if (error) {
    logger.error({ err: error }, 'Failed to upsert consent');
    return null;
  }

  return data as Record<string, unknown>;
}

/**
 * Get all consent records for a user.
 *
 * @param client - per-request RLS-scoped Supabase client
 */
export async function getConsents(
  client: SupabaseClient,
  userId: string
): Promise<Record<string, unknown>[]> {
  const { data, error } = await client
    .from('consent')
    .select('*')
    .eq('user_id', userId)
    .order('consent_type');

  if (error) {
    logger.error({ err: error }, 'Failed to fetch consents');
    return [];
  }

  return (data ?? []) as Record<string, unknown>[];
}

// ---------------------------------------------------------------------------
// DSAR (Data Subject Access Requests)
// ---------------------------------------------------------------------------

/**
 * Create a new DSAR request.
 *
 * @param client - per-request RLS-scoped Supabase client
 */
export async function createDsarRequest(
  client: SupabaseClient,
  userId: string,
  userEmail: string | undefined,
  requestType: DsarRequestType
): Promise<Record<string, unknown> | null> {
  const { data, error } = await client
    .from('dsar_requests')
    .insert({
      user_id: userId,
      user_email: userEmail ?? null,
      request_type: requestType,
      status: 'pending' as DsarStatus,
    })
    .select()
    .single();

  if (error) {
    logger.error({ err: error }, 'Failed to create DSAR request');
    return null;
  }

  return data as Record<string, unknown>;
}

/**
 * Get all DSAR requests for a user.
 *
 * @param client - per-request RLS-scoped Supabase client
 */
export async function getDsarRequests(
  client: SupabaseClient,
  userId: string
): Promise<Record<string, unknown>[]> {
  const { data, error } = await client
    .from('dsar_requests')
    .select('*')
    .eq('user_id', userId)
    .order('created_at', { ascending: false });

  if (error) {
    logger.error({ err: error }, 'Failed to fetch DSAR requests');
    return [];
  }

  return (data ?? []) as Record<string, unknown>[];
}

/**
 * Update DSAR request status (admin operation — uses service-role client).
 *
 * Bypasses RLS by design: support staff resolving DSAR tickets need to
 * reach any user's row.  To compensate, an `admin_action` audit-log entry
 * is emitted whenever the row actually changes, capturing the admin's
 * identity, the affected DSAR id, and the previous status (audit L8).
 * The generic `auditLog` middleware also fires, but the dedicated entry
 * makes admin DSAR mutations searchable independently of HTTP routing.
 */
export async function updateDsarStatus(
  requestId: string,
  status: DsarStatus,
  notes?: string,
  adminContext?: { adminId: string; adminEmail?: string }
): Promise<Record<string, unknown> | null> {
  const updates: Record<string, unknown> = {
    status,
    updated_at: new Date().toISOString(),
  };

  if (status === 'completed') {
    updates.completed_at = new Date().toISOString();
  }
  if (notes !== undefined) {
    updates.notes = notes;
  }

  // Capture the previous status so the admin_action audit entry can
  // record the state transition (audit L8).
  let previousStatus: string | undefined;
  try {
    const { data: prev } = await supabase
      .from('dsar_requests')
      .select('status')
      .eq('id', requestId)
      .maybeSingle();
    previousStatus =
      prev && typeof prev === 'object' && 'status' in prev
        ? ((prev as { status?: string }).status ?? undefined)
        : undefined;
  } catch (err) {
    logger.warn({ err, requestId }, 'Failed to read previous DSAR status');
  }

  const { data, error } = await supabase
    .from('dsar_requests')
    .update(updates)
    .eq('id', requestId)
    .select()
    .single();

  if (error) {
    logger.error({ err: error }, 'Failed to update DSAR status');
    return null;
  }

  if (data && adminContext) {
    // Fire-and-forget: an admin_action failure must not undo the legitimate
    // status update.  The generic auditLog middleware still records the
    // HTTP request; this entry adds the previous-status diff.
    recordAuditLog({
      actor_id: adminContext.adminId,
      actor_email: adminContext.adminEmail,
      action: 'admin_action:dsar.update_status',
      resource: 'dsar_requests',
      resource_id: requestId,
      before_state: { status: previousStatus ?? null },
      after_state: { status, completed_at: updates.completed_at ?? null },
    }).catch((auditErr) => {
      logger.error(
        { err: auditErr, requestId, adminId: adminContext.adminId },
        'Failed to record admin_action audit entry for DSAR update',
      );
    });
  }

  return data as Record<string, unknown>;
}

// ---------------------------------------------------------------------------
// Data export (portability)
// ---------------------------------------------------------------------------

/**
 * Export all data associated with a user.
 * Returns a structured object with all user-related data across tables.
 */
export async function exportUserData(
  userId: string
): Promise<Record<string, unknown>> {
  const exportData: Record<string, unknown> = {
    exported_at: new Date().toISOString(),
    user_id: userId,
  };

  // Audit log entries
  const { data: auditLogs } = await supabase
    .from('audit_log')
    .select('id, action, resource, resource_id, created_at')
    .eq('actor_id', userId)
    .order('created_at', { ascending: false });

  exportData.audit_logs = auditLogs ?? [];

  // Consent records
  const { data: consents } = await supabase
    .from('consent')
    .select('*')
    .eq('user_id', userId);

  exportData.consents = consents ?? [];

  // DSAR requests
  const { data: dsarRequests } = await supabase
    .from('dsar_requests')
    .select('*')
    .eq('user_id', userId);

  exportData.dsar_requests = dsarRequests ?? [];

  return exportData;
}

// ---------------------------------------------------------------------------
// Right to erasure
// ---------------------------------------------------------------------------

/**
 * Erase all personal data for a user (right to be forgotten — GDPR Art. 17).
 *
 * Cascade order:
 *
 *   1. `outreach`         — child of `influencers`; delete first to avoid
 *                            orphaned rows if the FK does not cascade.
 *   2. `influencers`      — user-owned CRM rows (free-text notes, scraped
 *                            bios, engagement metrics).
 *   3. `consent`          — preference rows.
 *   4. `audit_log`        — anonymise actor PII **and** clear the JSONB
 *                            `before_state` / `after_state` columns so the
 *                            historical request payloads (notes,
 *                            message bodies, scraped biographies) do not
 *                            survive erasure (audit M1 + M3).
 *   5. `dsar_requests`    — close out the user's existing DSAR rows.
 *
 * Uses the service-role client because RLS otherwise blocks cross-table
 * cleanup performed on behalf of the data subject.
 *
 * Returns a structured summary of which tables were touched and which
 * (if any) returned errors so the controller can surface a 207 Multi-Status
 * when the operation is partial.
 */
export async function eraseUserData(
  userId: string
): Promise<{ deletedTables: string[]; errors: string[] }> {
  const deletedTables: string[] = [];
  const errors: string[] = [];

  // 1. Outreach rows (child table — delete before influencers so we never
  //    rely on a database-level cascade that may not be configured in
  //    older environments).
  const { error: outreachError } = await supabase
    .from('outreach')
    .delete()
    .eq('user_id', userId);

  if (outreachError) {
    errors.push(`outreach: ${outreachError.message}`);
  } else {
    deletedTables.push('outreach');
  }

  // 2. Influencer rows (audit M1 — previously left in place, violating
  //    GDPR Art. 17).
  const { error: influencersError } = await supabase
    .from('influencers')
    .delete()
    .eq('user_id', userId);

  if (influencersError) {
    errors.push(`influencers: ${influencersError.message}`);
  } else {
    deletedTables.push('influencers');
  }

  // 3. Consent records
  const { error: consentError } = await supabase
    .from('consent')
    .delete()
    .eq('user_id', userId);

  if (consentError) {
    errors.push(`consent: ${consentError.message}`);
  } else {
    deletedTables.push('consent');
  }

  // 4. Anonymise audit log entries (kept for compliance / forensics, but
  //    stripped of every PII surface — actor identity, IP, and the JSONB
  //    payload columns that historically captured the raw request body
  //    [audit M3]).
  const { error: auditError } = await supabase
    .from('audit_log')
    .update({
      actor_id: 'REDACTED',
      actor_email: null,
      ip_address: null,
      before_state: null,
      after_state: null,
    })
    .eq('actor_id', userId);

  if (auditError) {
    errors.push(`audit_log: ${auditError.message}`);
  } else {
    deletedTables.push('audit_log (anonymized)');
  }

  // 5. Close DSAR rows so support staff have a record of the request
  //    without retaining the user's email / free-text notes.
  const { error: dsarError } = await supabase
    .from('dsar_requests')
    .update({
      status: 'completed' as DsarStatus,
      user_email: null,
      notes: 'User data erased per right-to-erasure request',
      completed_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq('user_id', userId);

  if (dsarError) {
    errors.push(`dsar_requests: ${dsarError.message}`);
  } else {
    deletedTables.push('dsar_requests (anonymized)');
  }

  return { deletedTables, errors };
}

// ---------------------------------------------------------------------------
// Data retention
// ---------------------------------------------------------------------------

/** Default retention periods in days */
const RETENTION_PERIODS: Record<string, number> = {
  audit_log: parseInt(process.env.RETENTION_AUDIT_LOG_DAYS ?? '90', 10),
  revoked_tokens: parseInt(process.env.RETENTION_REVOKED_TOKENS_DAYS ?? '30', 10),
  dsar_requests: parseInt(process.env.RETENTION_DSAR_DAYS ?? '365', 10),
};

/**
 * Purge records older than the configured retention period.
 * This should be run periodically (e.g. via cron or scheduled task).
 */
export async function purgeExpiredData(): Promise<Record<string, number>> {
  const results: Record<string, number> = {};

  for (const [table, days] of Object.entries(RETENTION_PERIODS)) {
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - days);
    const cutoffStr = cutoffDate.toISOString();

    try {
      const dateColumn = table === 'revoked_tokens' ? 'expires_at' : 'created_at';

      const { count, error } = await supabase
        .from(table)
        .delete({ count: 'exact' })
        .lt(dateColumn, cutoffStr);

      if (error) {
        logger.error({ err: error, table }, `Failed to purge ${table}`);
        results[table] = -1;
      } else {
        results[table] = count ?? 0;
        if ((count ?? 0) > 0) {
          logger.info({ table, purged: count, cutoff: cutoffStr }, `Purged expired ${table} records`);
        }
      }
    } catch (err) {
      logger.error({ err, table }, `Error purging ${table}`);
      results[table] = -1;
    }
  }

  return results;
}

// ---------------------------------------------------------------------------
// IP anonymization for audit logs
// ---------------------------------------------------------------------------

/**
 * Anonymize IP addresses in existing audit log entries.
 * Replaces the last octet of IPv4 or truncates IPv6.
 */
export function anonymizeIp(ip: string | null | undefined): string | null {
  if (!ip) return null;

  // IPv4: replace last octet with 0
  if (ip.includes('.') && !ip.includes(':')) {
    const parts = ip.split('.');
    if (parts.length === 4) {
      parts[3] = '0';
      return parts.join('.');
    }
  }

  // IPv6: keep first 4 groups, zero the rest
  if (ip.includes(':')) {
    const groups = ip.split(':');
    if (groups.length >= 4) {
      return groups.slice(0, 4).join(':') + '::';
    }
  }

  // Fallback: return null for unrecognized formats
  return null;
}

/**
 * Anonymize all IP addresses in the audit_log table.
 * This is a one-time migration operation.
 */
export async function anonymizeAuditLogIps(): Promise<number> {
  // Fetch all entries with non-null IP addresses
  const { data, error } = await supabase
    .from('audit_log')
    .select('id, ip_address')
    .not('ip_address', 'is', null);

  if (error || !data) {
    logger.error({ err: error }, 'Failed to fetch audit logs for IP anonymization');
    return 0;
  }

  let anonymized = 0;
  for (const entry of data) {
    const anonIp = anonymizeIp(entry.ip_address as string);
    if (anonIp !== entry.ip_address) {
      const { error: updateError } = await supabase
        .from('audit_log')
        .update({ ip_address: anonIp })
        .eq('id', entry.id);

      if (!updateError) {
        anonymized++;
      }
    }
  }

  logger.info({ anonymized }, 'Anonymized IP addresses in audit logs');
  return anonymized;
}
