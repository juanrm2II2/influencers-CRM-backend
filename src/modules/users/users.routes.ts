import { Router } from 'express';
import { ROLES, authenticate, requireRole } from '../../middleware/auth';
import { validate } from '../../middleware/validate';
import { NotImplementedError } from '../../utils/errors';
import {
  AssignRolesBodySchema,
  InviteUserBodySchema,
  ListUsersQuerySchema,
  UserIdParamSchema,
} from './users.schema';

export function usersRouter(): Router {
  const router = Router();

  router.get(
    '/',
    authenticate(),
    requireRole(ROLES.ADMIN),
    validate({ query: ListUsersQuerySchema }),
    (_req, _res, next) => next(new NotImplementedError('List users')),
  );

  router.post(
    '/invite',
    authenticate(),
    requireRole(ROLES.ADMIN),
    validate({ body: InviteUserBodySchema }),
    (_req, _res, next) => next(new NotImplementedError('Invite user')),
  );

  router.patch(
    '/:id/roles',
    authenticate(),
    requireRole(ROLES.ADMIN),
    validate({ params: UserIdParamSchema, body: AssignRolesBodySchema }),
    (_req, _res, next) => next(new NotImplementedError('Assign roles')),
  );

  router.delete(
    '/:id',
    authenticate(),
    requireRole(ROLES.ADMIN),
    validate({ params: UserIdParamSchema }),
    (_req, _res, next) => next(new NotImplementedError('Deactivate user')),
  );

  return router;
}
