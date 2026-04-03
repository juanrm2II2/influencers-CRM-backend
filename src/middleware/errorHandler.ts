import { Request, Response, NextFunction } from 'express';

/**
 * Centralized error-handling middleware.
 *
 * - Catches any unhandled errors thrown or passed via `next(err)`.
 * - Returns a generic message to the client (no stack traces, no internal details).
 * - Logs the full error server-side for debugging.
 */
export function errorHandler(
  err: Error,
  _req: Request,
  res: Response,
  _next: NextFunction
): void {
  console.error('[unhandled error]', err);

  res.status(500).json({ error: 'Internal server error' });
}
