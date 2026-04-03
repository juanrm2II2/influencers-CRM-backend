import { Request, Response, NextFunction } from 'express';

/**
 * Middleware factory that restricts access to users whose JWT `role` claim
 * matches one of the allowed roles.
 *
 * Must be used **after** the `authenticate` middleware so that `req.user`
 * is populated.
 *
 * @example
 *   router.delete('/:id', authenticate, authorize('admin'), deleteInfluencer);
 */
export function authorize(...allowedRoles: string[]) {
  return (req: Request, res: Response, next: NextFunction): void => {
    const userRole = req.user?.role;

    if (!userRole || !allowedRoles.includes(userRole)) {
      res.status(403).json({ error: 'Insufficient permissions' });
      return;
    }

    next();
  };
}
