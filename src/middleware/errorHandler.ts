import { Request, Response, NextFunction } from 'express';
import { logger } from '../logger';

/**
 * Centralized error-handling middleware.
 *
 * - Catches any unhandled errors thrown or passed via `next(err)`.
 * - Returns a generic message to the client (no stack traces, no internal details).
 * - Logs the full error server-side for debugging using structured logging.
 */
export function errorHandler(
  err: Error,
  _req: Request,
  res: Response,
  _next: NextFunction
): void {
  logger.error({ err }, 'Unhandled error');

  res.status(500).json({ error: 'Internal server error' });
}
