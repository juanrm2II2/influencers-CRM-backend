import { Request, Response, NextFunction } from 'express';

/**
 * State-changing HTTP methods that must declare a JSON content type when
 * they carry a body.  GET / DELETE / HEAD / OPTIONS are excluded because
 * RFC 9110 does not require them to have a body.
 */
const STATE_CHANGING = new Set(['POST', 'PUT', 'PATCH']);

/**
 * Strict Content-Type guard for state-changing requests (audit M2).
 *
 * `express.json()` with no `type` option happily parses any body that
 * *looks* like JSON regardless of the request's `Content-Type` header.
 * That lets an attacker send `text/plain` payloads to probe parser edge
 * cases or bypass downstream sanitisers that key off Content-Type.
 *
 * This middleware rejects any state-changing request that carries a body
 * but does not declare `application/json` (with or without parameters such
 * as `; charset=utf-8`) with HTTP 415.
 */
export function enforceJsonContentType(
  req: Request,
  res: Response,
  next: NextFunction
): void {
  if (!STATE_CHANGING.has(req.method)) {
    return next();
  }

  // No body at all? Allow — express.json() will set req.body = {}.
  const contentLength = req.headers['content-length'];
  const transferEncoding = req.headers['transfer-encoding'];
  const hasBody =
    (typeof contentLength === 'string' && parseInt(contentLength, 10) > 0) ||
    (typeof transferEncoding === 'string' && transferEncoding.length > 0);

  if (!hasBody) {
    return next();
  }

  const contentType = req.headers['content-type'];
  if (typeof contentType !== 'string' || !/^application\/json(\s*;.*)?$/i.test(contentType.trim())) {
    res.status(415).json({ error: 'Content-Type must be application/json' });
    return;
  }

  next();
}
