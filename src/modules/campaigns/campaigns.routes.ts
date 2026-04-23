import { Router } from 'express';
import { z } from 'zod';
import { ROLES, authenticate, requireRole } from '../../middleware/auth';
import { validate } from '../../middleware/validate';
import { NotImplementedError } from '../../utils/errors';
import { PaginationQuerySchema } from '../../utils/pagination';

const CampaignStatus = z.enum(['draft', 'active', 'paused', 'completed', 'cancelled']);
const CampaignIdParam = z.object({ id: z.string().uuid() });

const CreateCampaignBody = z.object({
  orgId: z.string().uuid(),
  name: z.string().trim().min(1).max(200),
  brand: z.string().trim().min(1).max(200),
  budget: z.number().nonnegative().max(1e12),
  currency: z.string().length(3),
  goals: z.string().trim().max(2000).optional(),
  startDate: z.string().datetime().optional(),
  endDate: z.string().datetime().optional(),
});

const UpdateCampaignBody = CreateCampaignBody.partial().extend({
  status: CampaignStatus.optional(),
});

const AddInfluencerBody = z.object({
  influencerId: z.string().uuid(),
  deliverables: z.string().trim().max(2000).optional(),
  priceCents: z.number().int().nonnegative().max(1e15),
  currency: z.string().length(3),
});

const ListCampaignsQuery = PaginationQuerySchema.extend({
  orgId: z.string().uuid().optional(),
  status: CampaignStatus.optional(),
});

export function campaignsRouter(): Router {
  const router = Router();

  router.get(
    '/',
    authenticate(),
    requireRole(ROLES.ADMIN, ROLES.MANAGER, ROLES.ANALYST, ROLES.AUDITOR),
    validate({ query: ListCampaignsQuery }),
    (_req, _res, next) => next(new NotImplementedError('List campaigns')),
  );

  router.post(
    '/',
    authenticate(),
    requireRole(ROLES.ADMIN, ROLES.MANAGER),
    validate({ body: CreateCampaignBody }),
    (_req, _res, next) => next(new NotImplementedError('Create campaign')),
  );

  router.get(
    '/:id',
    authenticate(),
    requireRole(ROLES.ADMIN, ROLES.MANAGER, ROLES.ANALYST, ROLES.AUDITOR),
    validate({ params: CampaignIdParam }),
    (_req, _res, next) => next(new NotImplementedError('Get campaign')),
  );

  router.patch(
    '/:id',
    authenticate(),
    requireRole(ROLES.ADMIN, ROLES.MANAGER),
    validate({ params: CampaignIdParam, body: UpdateCampaignBody }),
    (_req, _res, next) => next(new NotImplementedError('Update campaign')),
  );

  router.post(
    '/:id/influencers',
    authenticate(),
    requireRole(ROLES.ADMIN, ROLES.MANAGER),
    validate({ params: CampaignIdParam, body: AddInfluencerBody }),
    (_req, _res, next) => next(new NotImplementedError('Add influencer to campaign')),
  );

  return router;
}
