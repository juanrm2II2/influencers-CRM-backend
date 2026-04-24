import { Request, Response } from 'express';
import { tokenBlocklist } from '../services/tokenBlocklist';
import { supabase } from '../services/supabase';
import { logger } from '../logger';

/**
 * POST /api/auth/logout
 *
 * Revokes the caller's JWT so it can no longer be used for authentication.
 * The token is identified by its `jti` claim (required by the
 * {@link authenticate} middleware) and is added to the persistent
 * blocklist.
 *
 * Additionally, the user's Supabase refresh tokens are revoked globally so
 * that the refresh-token grant can no longer mint fresh access tokens.  A
 * failure of the Supabase admin call is logged but does **not** prevent the
 * local blocklist entry from being recorded — losing a refresh-token
 * revocation is less dangerous than leaving the access token unrevoked.
 */
export async function logout(req: Request, res: Response): Promise<void> {
  try {
    const user = req.user;
    if (!user) {
      res.status(401).json({ error: 'Not authenticated' });
      return;
    }

    // `authenticate` guarantees these are present, but narrow the types.
    const jti = user.jti;
    if (!jti) {
      res.status(401).json({ error: 'Not authenticated' });
      return;
    }

    const expiresAt = user.exp ?? Math.floor(Date.now() / 1000) + 3600;

    // 1) Blocklist the current access token so it cannot be replayed.
    await tokenBlocklist.revoke(jti, expiresAt);

    // 2) Revoke Supabase refresh tokens so the session cannot be renewed.
    //    The admin client tolerates the user already being signed out.
    try {
      const admin = (
        supabase as unknown as {
          auth: {
            admin?: { signOut?: (uid: string, scope?: string) => Promise<{ error: unknown }> };
          };
        }
      ).auth.admin;
      if (admin?.signOut && user.sub) {
        const { error } = await admin.signOut(user.sub, 'global');
        if (error) {
          logger.warn(
            { err: error, actor: user.sub },
            'supabase.auth.admin.signOut returned an error',
          );
        }
      }
    } catch (err) {
      logger.warn(
        { err, actor: user.sub },
        'Failed to revoke Supabase refresh tokens (non-fatal)',
      );
    }

    logger.info({ actor: user.sub }, 'Token revoked via logout');
    res.json({ message: 'Logged out successfully' });
  } catch (err) {
    logger.error({ err }, 'Logout failed');
    res.status(500).json({ error: 'Internal server error' });
  }
}
