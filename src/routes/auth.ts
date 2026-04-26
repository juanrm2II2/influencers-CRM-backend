import { Router, Request } from 'express';
import rateLimit from 'express-rate-limit';
import { authenticate } from '../middleware/auth';
import { logout } from '../controllers/auth.controller';

const router = Router();

/**
 * Per-user rate limiter for `POST /api/auth/logout` (audit L3).
 *
 * The global IP limiter (100 req / 15 min) does not stop an attacker
 * holding a stolen JWT from repeatedly calling logout to (a) churn the
 * blocklist cache, (b) force a re-authentication storm against Supabase,
 * or (c) flood `audit_log` with logout entries that mask their own
 * access pattern.  Keying the limit on the JWT `sub` caps every
 * individual user at 10 logouts / 15 min regardless of source IP.
 *
 * Falls back to `req.ip` for the (defence-in-depth) case where the
 * limiter ever runs without authentication — today the route registers
 * `authenticate` first, so by the time the limiter executes `req.user.sub`
 * is always present.  The literal `'anonymous'` bucket is therefore
 * unreachable on this route; it exists only so that a future refactor
 * which inadvertently moves the limiter ahead of `authenticate` still
 * fails closed (a single shared bucket) instead of throwing on a missing
 * key.  The `bulkSearchLimiter` in `routes/influencers.ts` follows the
 * same pattern.
 */
const logoutLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req: Request): string =>
    (req.user?.sub as string | undefined) ?? req.ip ?? 'anonymous',
  message: {
    error: 'Logout rate limit exceeded — try again later',
  },
});

// POST /api/auth/logout — revoke the current JWT
router.post('/logout', authenticate, logoutLimiter, logout);

export default router;
