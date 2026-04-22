import { Router } from 'express';
import { z } from 'zod';
import { ROLES, authenticate, requireRole } from '../../middleware/auth';
import { validate } from '../../middleware/validate';
import { NotImplementedError } from '../../utils/errors';

const ReportQuery = z.object({
  orgId: z.string().uuid().optional(),
  from: z.string().datetime().optional(),
  to: z.string().datetime().optional(),
  format: z.enum(['csv', 'pdf', 'json']).default('json'),
});

export function reportsRouter(): Router {
  const router = Router();

  router.get(
    '/campaigns',
    authenticate(),
    requireRole(ROLES.ADMIN, ROLES.MANAGER, ROLES.ANALYST, ROLES.AUDITOR),
    validate({ query: ReportQuery }),
    (_req, _res, next) => next(new NotImplementedError('Campaign report')),
  );

  router.get(
    '/payments',
    authenticate(),
    requireRole(ROLES.ADMIN, ROLES.MANAGER, ROLES.AUDITOR),
    validate({ query: ReportQuery }),
    (_req, _res, next) => next(new NotImplementedError('Payments report')),
  );

  router.get(
    '/audit-pack',
    authenticate(),
    requireRole(ROLES.ADMIN, ROLES.AUDITOR),
    validate({ query: ReportQuery }),
    (_req, _res, next) => next(new NotImplementedError('Audit pack export')),
  );

  return router;
}
