import { randomUUID } from 'node:crypto';
import type { NextFunction, Request, Response } from 'express';

const HEADER = 'x-request-id';

/**
 * Attach a stable request ID to every request. Honors an inbound
 * `X-Request-Id` header (up to 128 chars, safe characters only) so that
 * IDs can be propagated from an upstream load balancer or tracing system;
 * otherwise mints a UUID v4.
 */
export function requestId() {
  return (req: Request, res: Response, next: NextFunction): void => {
    const inbound = req.header(HEADER);
    const valid = inbound && /^[a-zA-Z0-9._-]{1,128}$/.test(inbound) ? inbound : randomUUID();
    (req as Request & { id: string }).id = valid;
    res.setHeader(HEADER, valid);
    next();
  };
}
