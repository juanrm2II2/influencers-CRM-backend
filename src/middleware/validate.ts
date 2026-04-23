import type { NextFunction, Request, Response } from 'express';
import type { ZodTypeAny } from 'zod';

/**
 * Generic request-validation middleware. Each section (body/query/params)
 * is validated independently and the request object is replaced with the
 * parsed/coerced result so downstream handlers get typed, trusted input.
 */
export function validate(schemas: { body?: ZodTypeAny; query?: ZodTypeAny; params?: ZodTypeAny }) {
  return (req: Request, _res: Response, next: NextFunction): void => {
    try {
      if (schemas.body) {
        req.body = schemas.body.parse(req.body);
      }
      if (schemas.query) {
        // Express query object is not mutable via assignment in v5-compatible
        // typings, so we replace with Object.defineProperty semantics.
        const parsed = schemas.query.parse(req.query);
        Object.keys(req.query).forEach((k) => delete (req.query as Record<string, unknown>)[k]);
        Object.assign(req.query, parsed);
      }
      if (schemas.params) {
        req.params = schemas.params.parse(req.params);
      }
      next();
    } catch (err) {
      next(err);
    }
  };
}
