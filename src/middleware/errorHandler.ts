import { Request, Response, NextFunction } from 'express';
import { logger } from '../logger';

/**
 * Centralized error-handling middleware.
 *
 * - Catches any unhandled errors thrown or passed via `next(err)`.
 * - Returns a generic message to the client (no stack traces, no internal details).
 * - Logs the full error server-side for debugging using structured logging.
 * - Echoes the request correlation ID (`X-Request-Id`, set by
 *   `middleware/requestId.ts`) so operators can match a customer-supplied
 *   error report to the structured pino logs (audit L7).
 * - Short-circuits with `next(err)` when the response has already started
 *   streaming.  Calling `res.status().json()` after headers have been sent
 *   throws `ERR_HTTP_HEADERS_SENT`, masking the original error and
 *   producing noisier crashes (audit M2).  Express's default finalhandler
 *   safely aborts the connection in that case.
 */
export function errorHandler(
  err: Error,
  req: Request,
  res: Response,
  next: NextFunction
): void {
  logger.error({ err, requestId: req.requestId }, 'Unhandled error');

  if (res.headersSent) {
    next(err);
    return;
  }

  const body: { error: string; requestId?: string } = {
    error: 'Internal server error',
  };
  if (req.requestId) {
    body.requestId = req.requestId;
  }

  res.status(500).json(body);
}
