import { Router } from 'express';
import { z } from 'zod';
import { ROLES, authenticate, requireRole } from '../../middleware/auth';
import { validate } from '../../middleware/validate';
import { NotImplementedError } from '../../utils/errors';
import { PaginationQuerySchema } from '../../utils/pagination';

const ListAuditQuery = PaginationQuerySchema.extend({
  orgId: z.string().uuid().optional(),
  actorId: z.string().uuid().optional(),
  action: z.string().trim().min(1).max(128).optional(),
  entityType: z.string().trim().min(1).max(64).optional(),
  entityId: z.string().uuid().optional(),
  from: z.string().datetime().optional(),
  to: z.string().datetime().optional(),
});

export function auditRouter(): Router {
  const router = Router();

  router.get(
    '/',
    authenticate(),
    requireRole(ROLES.ADMIN, ROLES.AUDITOR),
    validate({ query: ListAuditQuery }),
    (_req, _res, next) => next(new NotImplementedError('List audit log')),
  );

  router.get(
    '/verify',
    authenticate(),
    requireRole(ROLES.ADMIN, ROLES.AUDITOR),
    (_req, _res, next) => next(new NotImplementedError('Verify audit chain integrity')),
  );

  return router;
}
