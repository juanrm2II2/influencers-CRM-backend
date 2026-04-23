import { canonicalJSONStringify, hmacSha256Hex } from './hash';

/**
 * Tamper-evident audit log hash chain.
 *
 * Each row stores:
 *   - `row_hash`     = HMAC-SHA256(secret, prev_hash || canonicalJSON(payload))
 *   - `prev_hash`    = the previous row's `row_hash`, or GENESIS for the first row.
 *
 * Because each hash includes the previous hash, any modification or deletion
 * of an earlier row will break every subsequent `row_hash`, making tampering
 * detectable by re-running `verifyChain` over the ordered rows.
 *
 * The HMAC secret (server-held) prevents an attacker with DB-write access
 * from recomputing a valid chain without also stealing the secret.
 */
export const GENESIS_HASH = '0'.repeat(64);

export interface AuditPayload {
  /** Monotonic sequence number (set by the caller, typically DB-assigned). */
  seq: number;
  /** ISO 8601 timestamp with millisecond precision. */
  occurred_at: string;
  /** Acting user ID (Supabase auth user id) or null for system actions. */
  actor_id: string | null;
  /** Organization scope, if applicable. */
  org_id: string | null;
  /** Machine-readable action identifier, e.g. "influencers.create". */
  action: string;
  /** Target entity type, e.g. "influencer". */
  entity_type: string;
  /** Target entity id (UUID) or null for bulk actions. */
  entity_id: string | null;
  /** Structured before/after diff and additional context. */
  context: Record<string, unknown>;
  /** Request IP address, if available. */
  ip: string | null;
  /** Request user-agent, if available. */
  user_agent: string | null;
}

export interface AuditRow extends AuditPayload {
  prev_hash: string;
  row_hash: string;
}

/**
 * Compute the `row_hash` for a new audit entry given the prior row's hash.
 * Pure function; does not touch the DB.
 */
export function computeRowHash(secret: string, prevHash: string, payload: AuditPayload): string {
  if (!secret) throw new Error('Audit HMAC secret is required');
  if (!/^[0-9a-f]{64}$/i.test(prevHash)) {
    throw new Error('prevHash must be a 64-char hex string');
  }
  const material = `${prevHash.toLowerCase()}|${canonicalJSONStringify(payload)}`;
  return hmacSha256Hex(secret, material);
}

/**
 * Verify that an ordered sequence of audit rows forms an unbroken chain.
 * Returns { ok: true } on success, or { ok: false, brokenAt } pointing at
 * the index (0-based) of the first row that fails validation.
 */
export function verifyChain(
  secret: string,
  rows: AuditRow[],
  opts: { startHash?: string } = {},
): { ok: true } | { ok: false; brokenAt: number; reason: string } {
  let prev = opts.startHash ?? GENESIS_HASH;
  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    if (row.prev_hash.toLowerCase() !== prev.toLowerCase()) {
      return { ok: false, brokenAt: i, reason: 'prev_hash mismatch' };
    }
    const { prev_hash: _p, row_hash: _r, ...payload } = row;
    const expected = computeRowHash(secret, row.prev_hash, payload);
    if (expected.toLowerCase() !== row.row_hash.toLowerCase()) {
      return { ok: false, brokenAt: i, reason: 'row_hash mismatch' };
    }
    if (i > 0 && rows[i].seq <= rows[i - 1].seq) {
      return { ok: false, brokenAt: i, reason: 'non-monotonic seq' };
    }
    prev = row.row_hash;
  }
  return { ok: true };
}
