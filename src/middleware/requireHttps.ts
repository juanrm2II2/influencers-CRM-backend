import { Request, Response, NextFunction } from 'express';
import { logger } from '../logger';

/**
 * Middleware that enforces HTTPS in production.
 *
 * In production (NODE_ENV === 'production'), non-HTTPS requests are
 * redirected (301) to the equivalent HTTPS URL. Cloud load balancers
 * typically set the `X-Forwarded-Proto` header, so both that header
 * and `req.protocol` are checked.
 *
 * In non-production environments the middleware is a no-op to allow
 * local development over HTTP.
 */
export function requireHttps(
  req: Request,
  res: Response,
  next: NextFunction
): void {
  if (process.env.NODE_ENV !== 'production') {
    next();
    return;
  }

  // `req.secure` reads the protocol via Express's trust-proxy-aware logic
  // (`app.set('trust proxy', …)` is configured in createApp).  Falling back
  // to `req.protocol === 'https'` covers test stubs that don't populate
  // `secure`, but the X-Forwarded-Proto header is no longer trusted
  // unconditionally (M4).
  if (req.secure || req.protocol === 'https') {
    next();
    return;
  }

  const httpsUrl = `https://${req.hostname}${req.originalUrl}`;
  logger.warn({ from: req.originalUrl }, 'Redirecting HTTP to HTTPS');
  res.redirect(301, httpsUrl);
}
