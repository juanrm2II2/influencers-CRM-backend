import { Router } from 'express';
import { z } from 'zod';
import { authenticate } from '../../middleware/auth';
import { validate } from '../../middleware/validate';
import { NotImplementedError } from '../../utils/errors';

const LoginBody = z.object({
  email: z.string().email().max(254),
  password: z.string().min(8).max(200),
});

const RefreshBody = z.object({
  refreshToken: z.string().min(10).max(4096),
});

const PasswordResetBody = z.object({
  email: z.string().email().max(254),
});

/**
 * Auth endpoints are thin proxies over Supabase Auth. The actual token
 * issuance is delegated to Supabase; this layer exists to:
 *   - enforce input validation and rate limits,
 *   - emit audit events for login/logout/reset,
 *   - normalize error responses.
 *
 * Signup is NOT exposed publicly — users are invited by admins via
 * `POST /users/invite`.
 */
export function authRouter(): Router {
  const router = Router();

  router.post('/login', validate({ body: LoginBody }), (_req, _res, next) =>
    next(new NotImplementedError('Login')),
  );

  router.post('/refresh', validate({ body: RefreshBody }), (_req, _res, next) =>
    next(new NotImplementedError('Refresh token')),
  );

  router.post('/logout', authenticate(), (_req, _res, next) =>
    next(new NotImplementedError('Logout')),
  );

  router.post('/password-reset', validate({ body: PasswordResetBody }), (_req, _res, next) =>
    next(new NotImplementedError('Password reset')),
  );

  router.get('/me', authenticate(), (_req, _res, next) =>
    next(new NotImplementedError('Current user')),
  );

  return router;
}
