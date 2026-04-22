import rateLimit from 'express-rate-limit';
import { env } from '../config/env';
import { RateLimitError } from '../utils/errors';

/**
 * Global rate limiter. For multi-instance deployments, swap the in-memory
 * store for a Redis-backed one (`rate-limit-redis`) — the interface is the
 * same and requires no route changes.
 */
export function globalRateLimiter() {
  return rateLimit({
    windowMs: env().RATE_LIMIT_WINDOW_MS,
    limit: env().RATE_LIMIT_MAX,
    standardHeaders: 'draft-7',
    legacyHeaders: false,
    handler: (_req, _res, next) => next(new RateLimitError()),
  });
}

/**
 * Tighter limiter for expensive / cost-bearing endpoints (e.g. on-demand
 * ScrapeCreators refresh). Keyed by authenticated user id when available,
 * otherwise IP.
 */
export function expensiveOperationLimiter(opts: { windowMs?: number; limit?: number } = {}) {
  return rateLimit({
    windowMs: opts.windowMs ?? 60_000,
    limit: opts.limit ?? 10,
    standardHeaders: 'draft-7',
    legacyHeaders: false,
    keyGenerator: (req) => {
      const user = (req as unknown as { auth?: { userId?: string } }).auth?.userId;
      return user ?? req.ip ?? 'anonymous';
    },
    handler: (_req, _res, next) => next(new RateLimitError()),
  });
}
