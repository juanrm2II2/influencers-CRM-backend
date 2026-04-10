import { Request, Response } from 'express';
import { tokenBlocklist } from '../services/tokenBlocklist';
import { logger } from '../logger';

/**
 * POST /api/auth/logout
 *
 * Revokes the caller's JWT so it can no longer be used for authentication.
 * The token is identified by its `jti` claim (or the raw token string if no
 * `jti` is present) and is added to the persistent blocklist.
 */
export async function logout(req: Request, res: Response): Promise<void> {
  try {
    const user = req.user;
    if (!user) {
      res.status(401).json({ error: 'Not authenticated' });
      return;
    }

    // Extract the raw token from the Authorization header
    const authHeader = req.headers.authorization;
    const rawToken = authHeader?.slice(7) ?? '';

    const tokenId = user.jti ?? rawToken;
    const expiresAt = user.exp ?? Math.floor(Date.now() / 1000) + 3600;

    await tokenBlocklist.revoke(tokenId, expiresAt);

    logger.info({ actor: user.sub }, 'Token revoked via logout');
    res.json({ message: 'Logged out successfully' });
  } catch (err) {
    logger.error({ err }, 'Logout failed');
    res.status(500).json({ error: 'Internal server error' });
  }
}
