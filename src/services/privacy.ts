import { SupabaseClient } from '@supabase/supabase-js';
import { supabase } from './supabase';
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
 */
export async function updateDsarStatus(
  requestId: string,
  status: DsarStatus,
  notes?: string
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
 * Erase all personal data for a user (right to be forgotten).
 * Returns a summary of what was deleted.
 */
export async function eraseUserData(
  userId: string
): Promise<{ deletedTables: string[]; errors: string[] }> {
  const deletedTables: string[] = [];
  const errors: string[] = [];

  // Delete consent records
  const { error: consentError } = await supabase
    .from('consent')
    .delete()
    .eq('user_id', userId);

  if (consentError) {
    errors.push(`consent: ${consentError.message}`);
  } else {
    deletedTables.push('consent');
  }

  // Anonymize audit log entries (keep for compliance, but strip PII)
  const { error: auditError } = await supabase
    .from('audit_log')
    .update({
      actor_id: 'REDACTED',
      actor_email: null,
      ip_address: null,
    })
    .eq('actor_id', userId);

  if (auditError) {
    errors.push(`audit_log: ${auditError.message}`);
  } else {
    deletedTables.push('audit_log (anonymized)');
  }

  // Mark DSAR requests as completed
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
