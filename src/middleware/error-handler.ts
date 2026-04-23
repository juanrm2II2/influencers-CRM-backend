import type { NextFunction, Request, Response } from 'express';
import { ZodError } from 'zod';
import { AppError } from '../utils/errors';
import { logger } from '../config/logger';

interface ErrorBody {
  error: {
    code: string;
    message: string;
    requestId?: string;
    details?: unknown;
  };
}

/**
 * Central error handler. Converts known errors into structured responses
 * and logs unexpected ones without leaking stack traces to clients.
 */
export function errorHandler() {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  return (err: unknown, req: Request, res: Response, _next: NextFunction): void => {
    const requestId = (req as Request & { id?: string }).id;

    if (err instanceof ZodError) {
      const body: ErrorBody = {
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Request validation failed',
          requestId,
          details: err.issues.map((i) => ({
            path: i.path.join('.'),
            message: i.message,
            code: i.code,
          })),
        },
      };
      res.status(400).json(body);
      return;
    }

    if (err instanceof AppError) {
      if (err.status >= 500) {
        logger.error({ err, requestId }, 'AppError (5xx)');
      }
      const body: ErrorBody = {
        error: {
          code: err.code,
          message: err.expose ? err.message : 'Internal server error',
          requestId,
          ...(err.expose && err.details !== undefined ? { details: err.details } : {}),
        },
      };
      res.status(err.status).json(body);
      return;
    }

    // Unknown error — never leak internals.
    logger.error({ err, requestId }, 'Unhandled error');
    const body: ErrorBody = {
      error: {
        code: 'INTERNAL_ERROR',
        message: 'Internal server error',
        requestId,
      },
    };
    res.status(500).json(body);
  };
}

/** 404 fallback for unmatched routes. */
export function notFoundHandler() {
  return (req: Request, res: Response): void => {
    const requestId = (req as Request & { id?: string }).id;
    res.status(404).json({
      error: {
        code: 'NOT_FOUND',
        message: `Route ${req.method} ${req.path} not found`,
        requestId,
      },
    });
  };
}
