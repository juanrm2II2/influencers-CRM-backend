/**
 * JWT Token Blocklist for token revocation support.
 *
 * This module provides a **persistent**, database-backed blocklist for revoked
 * JWT tokens using the Supabase (PostgreSQL) `revoked_tokens` table.
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

import { supabase } from './supabase';
import { logger } from '../logger';

const TABLE = 'revoked_tokens';

class TokenBlocklist {
  private cleanupInterval: ReturnType<typeof setInterval> | null = null;

  constructor() {
    // Clean up expired tokens every 15 minutes
    this.cleanupInterval = setInterval(() => this.cleanup(), 15 * 60 * 1000);
    if (this.cleanupInterval.unref) {
      this.cleanupInterval.unref();
    }
  }

  /**
   * Add a token to the blocklist (persistent).
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
  }

  /**
   * Check whether a token has been revoked.
   * @param token - JTI or full token string
   * @returns true if the token is in the blocklist
   */
  async isRevoked(token: string): Promise<boolean> {
    const { data, error } = await supabase
      .from(TABLE)
      .select('token')
      .eq('token', token)
      .maybeSingle();

    if (error) {
      // Fail-open with a warning so a temporary DB outage does not block all
      // authenticated requests.  The JWT signature is still verified
      // independently, so the risk is limited to previously-revoked tokens.
      logger.warn({ err: error }, 'Token blocklist lookup failed – proceeding');
      return false;
    }

    return data !== null;
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
   * Shut down the cleanup interval (for testing / graceful shutdown).
   */
  destroy(): void {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
      this.cleanupInterval = null;
    }
  }
}

/** Singleton token blocklist instance */
export const tokenBlocklist = new TokenBlocklist();
