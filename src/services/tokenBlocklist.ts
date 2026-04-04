/**
 * JWT Token Blocklist for token revocation support.
 *
 * This module provides an in-memory Set-based blocklist for revoked JWT tokens.
 * The interface is designed to be easily swapped for a Redis-backed implementation
 * in production by replacing the store methods.
 *
 * Tokens are stored by their JTI (JWT ID) or the full token string if no JTI is present.
 * Expired entries are cleaned up periodically to prevent unbounded memory growth.
 */

interface TokenEntry {
  /** Token identifier (JTI or full token) */
  token: string;
  /** Expiration timestamp in milliseconds */
  expiresAt: number;
}

class TokenBlocklist {
  private blocklist: Map<string, TokenEntry> = new Map();
  private cleanupInterval: ReturnType<typeof setInterval> | null = null;

  constructor() {
    // Clean up expired tokens every 15 minutes
    this.cleanupInterval = setInterval(() => this.cleanup(), 15 * 60 * 1000);
    // Allow the process to exit even if the interval is still running
    if (this.cleanupInterval.unref) {
      this.cleanupInterval.unref();
    }
  }

  /**
   * Add a token to the blocklist.
   * @param token - JTI or full token string to revoke
   * @param expiresAt - When the token expires (in seconds since epoch).
   *                    After this time the entry will be cleaned up.
   */
  revoke(token: string, expiresAt: number): void {
    this.blocklist.set(token, {
      token,
      expiresAt: expiresAt * 1000, // convert to ms
    });
  }

  /**
   * Check whether a token has been revoked.
   * @param token - JTI or full token string
   * @returns true if the token is in the blocklist
   */
  isRevoked(token: string): boolean {
    return this.blocklist.has(token);
  }

  /**
   * Remove expired entries from the blocklist.
   */
  private cleanup(): void {
    const now = Date.now();
    for (const [key, entry] of this.blocklist) {
      if (entry.expiresAt <= now) {
        this.blocklist.delete(key);
      }
    }
  }

  /**
   * Shut down the cleanup interval (for testing).
   */
  destroy(): void {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
      this.cleanupInterval = null;
    }
  }

  /**
   * Get the current size of the blocklist (for monitoring).
   */
  get size(): number {
    return this.blocklist.size;
  }
}

/** Singleton token blocklist instance */
export const tokenBlocklist = new TokenBlocklist();
