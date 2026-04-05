/**
 * JWT Token Blocklist for token revocation support.
 *
 * This module provides a **persistent**, database-backed blocklist for revoked
 * JWT tokens using the Supabase (PostgreSQL) `revoked_tokens` table, backed
 * by in-memory LRU caches for resilience and performance.
 *
 * **Fail-closed behaviour on DB errors:**
 *   1. Check the in-memory revoked cache – if the token is there, treat as revoked.
 *   2. Check the in-memory known-good cache – if the token is there, treat as NOT revoked.
 *   3. Otherwise, fail closed (treat as revoked) to prevent use of potentially-revoked tokens.
 *
 * Tokens are stored by their JTI (JWT ID) or the full token string if no JTI
 * is present.  Expired entries are cleaned up periodically by the database
 * via the cleanup query so the table does not grow without bound.
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

import { LRUCache } from 'lru-cache';
import { supabase } from './supabase';
import { logger } from '../logger';

const TABLE = 'revoked_tokens';

/** Max entries in each in-memory cache */
const CACHE_MAX = 10_000;

/** TTL for entries in the known-good cache (ms).  60 s keeps the window of
 *  exposure short while still absorbing short DB blips. */
const KNOWN_GOOD_TTL_MS = 60_000;

/** TTL for entries in the revoked cache (ms).  24 h is generous; entries are
 *  evicted by the LRU policy long before this for busy instances. */
const REVOKED_TTL_MS = 24 * 60 * 60 * 1000;

/** Interval between cache-stats log lines (ms). */
const STATS_LOG_INTERVAL_MS = 5 * 60 * 1000; // 5 min

class TokenBlocklist {
  private cleanupInterval: ReturnType<typeof setInterval> | null = null;
  private statsInterval: ReturnType<typeof setInterval> | null = null;

  /** Tokens that the DB confirmed as revoked. */
  private revokedCache: LRUCache<string, true>;

  /** Tokens that the DB confirmed as NOT revoked (short TTL). */
  private knownGoodCache: LRUCache<string, true>;

  constructor() {
    this.revokedCache = new LRUCache<string, true>({
      max: CACHE_MAX,
      ttl: REVOKED_TTL_MS,
    });

    this.knownGoodCache = new LRUCache<string, true>({
      max: CACHE_MAX,
      ttl: KNOWN_GOOD_TTL_MS,
    });

    // Clean up expired tokens every 15 minutes
    this.cleanupInterval = setInterval(() => this.cleanup(), 15 * 60 * 1000);
    if (this.cleanupInterval.unref) {
      this.cleanupInterval.unref();
    }

    // Log cache statistics every 5 minutes
    this.statsInterval = setInterval(() => this.logCacheStats(), STATS_LOG_INTERVAL_MS);
    if (this.statsInterval.unref) {
      this.statsInterval.unref();
    }
  }

  /**
   * Add a token to the blocklist (persistent + in-memory).
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

    // Update in-memory caches: mark revoked, remove from known-good
    this.revokedCache.set(token, true);
    this.knownGoodCache.delete(token);
  }

  /**
   * Check whether a token has been revoked.
   *
   * On DB error the method falls back to in-memory caches and ultimately
   * **fails closed** (returns `true`) so that a potentially-revoked token
   * cannot be used during a database outage.
   *
   * @param token - JTI or full token string
   * @returns true if the token is (or should be treated as) revoked
   */
  async isRevoked(token: string): Promise<boolean> {
    const { data, error } = await supabase
      .from(TABLE)
      .select('token')
      .eq('token', token)
      .maybeSingle();

    if (error) {
      // DB unavailable – consult in-memory caches, then fail closed.
      if (this.revokedCache.has(token)) {
        logger.warn(
          { err: error },
          'Token blocklist lookup failed – token found in revoked cache',
        );
        return true;
      }

      if (this.knownGoodCache.has(token)) {
        logger.warn(
          { err: error },
          'Token blocklist lookup failed – token found in known-good cache, allowing',
        );
        return false;
      }

      logger.warn(
        { err: error },
        'Token blocklist lookup failed – failing closed',
      );
      return true;
    }

    const revoked = data !== null;

    // Populate the appropriate in-memory cache for future fall-back.
    if (revoked) {
      this.revokedCache.set(token, true);
      this.knownGoodCache.delete(token);
    } else {
      this.knownGoodCache.set(token, true);
    }

    return revoked;
  }

  /**
   * Return a snapshot of cache statistics for monitoring.
   */
  cacheStats(): { revokedSize: number; knownGoodSize: number } {
    return {
      revokedSize: this.revokedCache.size,
      knownGoodSize: this.knownGoodCache.size,
    };
  }

  /**
   * Clear both in-memory caches (useful in tests).
   */
  clearCaches(): void {
    this.revokedCache.clear();
    this.knownGoodCache.clear();
  }

  /**
   * Remove expired entries from the database.
   */
  private async cleanup(): Promise<void> {
    const now = new Date().toISOString();
    const { error } = await supabase
      .from(TABLE)
      .delete()
      .lt('expires_at', now);

    if (error) {
      logger.warn({ err: error }, 'Token blocklist cleanup failed');
    }
  }

  /**
   * Log current cache sizes for operational monitoring.
   */
  private logCacheStats(): void {
    const stats = this.cacheStats();
    logger.info(
      { tokenBlocklistCache: stats },
      'Token blocklist cache statistics',
    );
  }

  /**
   * Shut down the cleanup & stats intervals (for testing / graceful shutdown).
   */
  destroy(): void {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
      this.cleanupInterval = null;
    }
    if (this.statsInterval) {
      clearInterval(this.statsInterval);
      this.statsInterval = null;
    }
  }
}

/** Singleton token blocklist instance */
export const tokenBlocklist = new TokenBlocklist();
