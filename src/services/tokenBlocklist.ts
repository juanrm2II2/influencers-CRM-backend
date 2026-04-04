/**
 * JWT Token Blocklist for token revocation support.
 *
 * This module provides a **persistent**, database-backed blocklist for revoked
 * JWT tokens using the Supabase (PostgreSQL) `revoked_tokens` table, with an
 * **in-memory cache** fallback and **fail-closed** semantics.
 *
 * Fail-closed behaviour:
 *   - On successful DB lookup the result is authoritative and cached locally.
 *   - When the DB is unreachable the in-memory cache is consulted:
 *       • If the token is in the revoked-tokens cache → revoked (true).
 *       • If the token is in the known-good cache    → not revoked (false).
 *       • Otherwise we **fail closed** (return true) to prevent a
 *         previously-revoked token from being accepted during an outage.
 *
 * Tokens are stored by their JTI (JWT ID) or the full token string if no JTI
 * is present.  Expired entries are cleaned up periodically both in the database
 * and in the in-memory caches so neither grows without bound.
 *
 * Required table (see migrations/001_create_revoked_tokens.sql):
 *
 *   CREATE TABLE IF NOT EXISTS revoked_tokens (
 *     token      TEXT        PRIMARY KEY,
 *     expires_at TIMESTAMPTZ NOT NULL,
 *     revoked_at TIMESTAMPTZ NOT NULL DEFAULT now()
 *   );
 *   CREATE INDEX idx_revoked_tokens_expires_at ON revoked_tokens (expires_at);
 */

import { supabase } from './supabase';
import { logger } from '../logger';

const TABLE = 'revoked_tokens';

/** Default TTL (in ms) for the known-good (non-revoked) cache – 60 seconds. */
const KNOWN_GOOD_TTL_MS = 60_000;

class TokenBlocklist {
  private cleanupInterval: ReturnType<typeof setInterval> | null = null;

  /**
   * In-memory cache of revoked tokens.
   * Key: token identifier (JTI or full token)
   * Value: expiry timestamp in **milliseconds** since epoch (same semantics as
   *        the `expires_at` column – entries are evicted once the JWT itself
   *        would have expired).
   */
  private revokedCache = new Map<string, number>();

  /**
   * In-memory cache of tokens recently verified as *not* revoked.
   * Key: token identifier
   * Value: wall-clock time (ms) at which the cache entry expires.
   *
   * This prevents a DB outage from rejecting every single request for tokens
   * that were known-good moments earlier.
   */
  private knownGoodCache = new Map<string, number>();

  constructor() {
    // Clean up expired tokens every 15 minutes
    this.cleanupInterval = setInterval(() => this.cleanup(), 15 * 60 * 1000);
    if (this.cleanupInterval.unref) {
      this.cleanupInterval.unref();
    }
  }

  /**
   * Add a token to the blocklist (persistent + in-memory cache).
   * @param token - JTI or full token string to revoke
   * @param expiresAt - When the token expires (seconds since epoch).
   */
  async revoke(token: string, expiresAt: number): Promise<void> {
    const expiresAtIso = new Date(expiresAt * 1000).toISOString();

    const { error } = await supabase
      .from(TABLE)
      .upsert({ token, expires_at: expiresAtIso }, { onConflict: 'token' });

    if (error) {
      logger.error({ err: error }, 'Failed to persist revoked token');
      throw new Error('Failed to revoke token');
    }

    // Mirror into in-memory cache and remove from known-good set.
    this.revokedCache.set(token, expiresAt * 1000);
    this.knownGoodCache.delete(token);
  }

  /**
   * Check whether a token has been revoked.
   *
   * Strategy:
   *   1. Query the database (authoritative source).
   *   2. On success, update the in-memory caches accordingly.
   *   3. On DB error, fall back to in-memory caches.
   *   4. If neither cache contains the token, **fail closed** (treat as
   *      revoked) to avoid accepting a potentially-revoked token.
   *
   * @param token - JTI or full token string
   * @returns true if the token should be treated as revoked
   */
  async isRevoked(token: string): Promise<boolean> {
    const { data, error } = await supabase
      .from(TABLE)
      .select('token')
      .eq('token', token)
      .maybeSingle();

    if (!error) {
      // Authoritative answer from the database.
      const revoked = data !== null;
      if (revoked) {
        // Ensure the revoked token is in the local cache (may have been
        // revoked by another instance).  We don't know the exact expiry here
        // so we set a generous TTL; the periodic cleanup will evict it.
        if (!this.revokedCache.has(token)) {
          this.revokedCache.set(token, Date.now() + 24 * 60 * 60 * 1000);
        }
        this.knownGoodCache.delete(token);
      } else {
        // Token is not revoked – cache the result for a short window so that a
        // brief DB blip right after this check doesn't cause a false-positive
        // rejection.
        this.knownGoodCache.set(token, Date.now() + KNOWN_GOOD_TTL_MS);
        this.revokedCache.delete(token);
      }
      return revoked;
    }

    // --- DB lookup failed – fall back to in-memory caches ---
    logger.warn({ err: error }, 'Token blocklist DB lookup failed – using in-memory cache fallback');

    const now = Date.now();

    // 1. Check the revoked-tokens cache.
    const revokedExpiry = this.revokedCache.get(token);
    if (revokedExpiry !== undefined && revokedExpiry > now) {
      return true;
    }

    // 2. Check the known-good cache.
    const goodExpiry = this.knownGoodCache.get(token);
    if (goodExpiry !== undefined && goodExpiry > now) {
      return false;
    }

    // 3. Neither cache has a record → fail closed.
    logger.warn(
      { token: token.slice(0, 8) + '…' },
      'Token not found in any cache during DB outage – failing closed',
    );
    return true;
  }

  /**
   * Remove expired entries from the database and in-memory caches.
   */
  private async cleanup(): Promise<void> {
    const now = new Date();
    const { error } = await supabase
      .from(TABLE)
      .delete()
      .lt('expires_at', now.toISOString());

    if (error) {
      logger.warn({ err: error }, 'Token blocklist cleanup failed');
    }

    // Purge expired entries from in-memory caches.
    const nowMs = now.getTime();
    for (const [key, expiry] of this.revokedCache) {
      if (expiry <= nowMs) this.revokedCache.delete(key);
    }
    for (const [key, expiry] of this.knownGoodCache) {
      if (expiry <= nowMs) this.knownGoodCache.delete(key);
    }
  }

  /**
   * Shut down the cleanup interval (for testing / graceful shutdown).
   */
  destroy(): void {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
      this.cleanupInterval = null;
    }
  }

  // ---------- Helpers exposed for testing ----------

  /** Clear all in-memory caches. */
  clearCaches(): void {
    this.revokedCache.clear();
    this.knownGoodCache.clear();
  }

  /** Snapshot of current cache sizes (useful for diagnostics). */
  get cacheStats(): { revokedSize: number; knownGoodSize: number } {
    return {
      revokedSize: this.revokedCache.size,
      knownGoodSize: this.knownGoodCache.size,
    };
  }
}

/** Singleton token blocklist instance */
export const tokenBlocklist = new TokenBlocklist();
