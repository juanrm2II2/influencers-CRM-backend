import { Router } from 'express';
import { z } from 'zod';
import { ROLES, authenticate, requireRole } from '../../middleware/auth';
import { validate } from '../../middleware/validate';
import { NotImplementedError } from '../../utils/errors';
import { PlatformEnum, HandleSchema } from '../influencers/influencers.schema';

const InfluencerIdParam = z.object({ influencerId: z.string().uuid() });
const AccountIdParam = z.object({ accountId: z.string().uuid() });

const LinkAccountBody = z.object({
  platform: PlatformEnum,
  handle: HandleSchema,
});

export function influencerAccountsRouter(): Router {
  const router = Router({ mergeParams: true });

  router.get(
    '/influencers/:influencerId/accounts',
    authenticate(),
    requireRole(ROLES.ADMIN, ROLES.MANAGER, ROLES.ANALYST, ROLES.AUDITOR),
    validate({ params: InfluencerIdParam }),
    (_req, _res, next) => next(new NotImplementedError('List accounts')),
  );

  router.post(
    '/influencers/:influencerId/accounts',
    authenticate(),
    requireRole(ROLES.ADMIN, ROLES.MANAGER),
    validate({ params: InfluencerIdParam, body: LinkAccountBody }),
    (_req, _res, next) => next(new NotImplementedError('Link account')),
  );

  router.delete(
    '/accounts/:accountId',
    authenticate(),
    requireRole(ROLES.ADMIN, ROLES.MANAGER),
    validate({ params: AccountIdParam }),
    (_req, _res, next) => next(new NotImplementedError('Unlink account')),
  );

  router.post(
    '/accounts/:accountId/sync',
    authenticate(),
    requireRole(ROLES.ADMIN, ROLES.MANAGER, ROLES.ANALYST),
    validate({ params: AccountIdParam }),
    (_req, _res, next) => next(new NotImplementedError('Sync account from ScrapeCreators')),
  );

  return router;
}
