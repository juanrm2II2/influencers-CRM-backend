import { Request, Response, NextFunction } from 'express';
import crypto from 'crypto';

/**
 * UUID v4 pattern for validating incoming X-Request-Id headers.
 * Only accept well-formed UUIDs to prevent header injection.
 */
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Middleware that ensures every request has a unique correlation ID.
 *
 * - If the client sends a valid `X-Request-Id` header (UUID v4), it is reused.
 * - Otherwise a new UUID v4 is generated.
 * - The ID is attached to `req.requestId` and echoed back in the response
 *   `X-Request-Id` header so clients can correlate requests with logs.
 */
export function requestId(
  req: Request,
  res: Response,
  next: NextFunction
): void {
  const incoming = req.headers['x-request-id'];
  const id =
    typeof incoming === 'string' && UUID_RE.test(incoming)
      ? incoming
      : crypto.randomUUID();

  req.requestId = id;
  res.setHeader('X-Request-Id', id);
  next();
}
