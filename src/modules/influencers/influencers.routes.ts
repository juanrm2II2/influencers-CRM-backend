import { Router } from 'express';
import { ROLES, authenticate, requireRole } from '../../middleware/auth';
import { expensiveOperationLimiter } from '../../middleware/rate-limit';
import { validate } from '../../middleware/validate';
import { NotImplementedError } from '../../utils/errors';
import {
  CreateInfluencerBodySchema,
  InfluencerIdParamSchema,
  ListInfluencersQuerySchema,
  RefreshInfluencerBodySchema,
} from './influencers.schema';

/**
 * Influencer CRM endpoints.
 *
 * Service implementations land in a subsequent phase. These routes exist
 * now so the API contract, validation, auth, and rate limits are frozen
 * and covered by integration tests.
 */
export function influencersRouter(): Router {
  const router = Router();

  router.get(
    '/',
    authenticate(),
    requireRole(ROLES.ADMIN, ROLES.MANAGER, ROLES.ANALYST, ROLES.AUDITOR),
    validate({ query: ListInfluencersQuerySchema }),
    (_req, _res, next) => next(new NotImplementedError('List influencers')),
  );

  router.post(
    '/',
    authenticate(),
    requireRole(ROLES.ADMIN, ROLES.MANAGER),
    validate({ body: CreateInfluencerBodySchema }),
    (_req, _res, next) => next(new NotImplementedError('Create influencer')),
  );

  router.get(
    '/:id',
    authenticate(),
    requireRole(ROLES.ADMIN, ROLES.MANAGER, ROLES.ANALYST, ROLES.AUDITOR),
    validate({ params: InfluencerIdParamSchema }),
    (_req, _res, next) => next(new NotImplementedError('Get influencer')),
  );

  router.post(
    '/:id/refresh',
    authenticate(),
    requireRole(ROLES.ADMIN, ROLES.MANAGER, ROLES.ANALYST),
    expensiveOperationLimiter({ limit: 20 }),
    validate({ params: InfluencerIdParamSchema, body: RefreshInfluencerBodySchema }),
    (_req, _res, next) => next(new NotImplementedError('Refresh influencer from ScrapeCreators')),
  );

  router.get(
    '/:id/metrics',
    authenticate(),
    requireRole(ROLES.ADMIN, ROLES.MANAGER, ROLES.ANALYST, ROLES.AUDITOR),
    validate({ params: InfluencerIdParamSchema }),
    (_req, _res, next) => next(new NotImplementedError('List influencer metrics history')),
  );

  return router;
}
