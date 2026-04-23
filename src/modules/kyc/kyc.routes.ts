import { Router } from 'express';
import { z } from 'zod';
import { ROLES, authenticate, requireRole } from '../../middleware/auth';
import { validate } from '../../middleware/validate';
import { NotImplementedError } from '../../utils/errors';

const KycIdParam = z.object({ id: z.string().uuid() });

const InitiateKycBody = z.object({
  subjectType: z.enum(['influencer', 'counterparty']),
  subjectId: z.string().uuid(),
  provider: z.string().trim().min(1).max(64), // provider-agnostic key
});

/**
 * KYC endpoints. The vendor is selected at runtime via the `provider`
 * field so adapters (Sumsub, Persona, Veriff, …) can be added without
 * API changes. Provider webhooks are handled under `/webhooks/kyc`.
 */
export function kycRouter(): Router {
  const router = Router();

  router.post(
    '/',
    authenticate(),
    requireRole(ROLES.ADMIN, ROLES.MANAGER),
    validate({ body: InitiateKycBody }),
    (_req, _res, next) => next(new NotImplementedError('Initiate KYC')),
  );

  router.get(
    '/:id',
    authenticate(),
    requireRole(ROLES.ADMIN, ROLES.MANAGER, ROLES.AUDITOR),
    validate({ params: KycIdParam }),
    (_req, _res, next) => next(new NotImplementedError('Get KYC record')),
  );

  return router;
}
