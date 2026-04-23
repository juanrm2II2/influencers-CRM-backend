import { Router } from 'express';
import { z } from 'zod';
import { ROLES, authenticate, requireRole } from '../../middleware/auth';
import { validate } from '../../middleware/validate';
import { NotImplementedError } from '../../utils/errors';

const ContractIdParam = z.object({ id: z.string().uuid() });

const CreateContractBody = z.object({
  campaignId: z.string().uuid(),
  influencerId: z.string().uuid(),
  /** Supabase Storage path of the uploaded contract document. */
  storagePath: z.string().trim().min(1).max(500),
  /** SHA-256 hex digest of the uploaded document. Verified server-side. */
  documentSha256: z.string().regex(/^[0-9a-f]{64}$/i),
  effectiveAt: z.string().datetime(),
  expiresAt: z.string().datetime().optional(),
});

const SignContractBody = z.object({
  signerName: z.string().trim().min(1).max(200),
  signerEmail: z.string().email().max(254),
  signatureMethod: z.enum(['click', 'eid', 'wallet']),
});

export function contractsRouter(): Router {
  const router = Router();

  router.post(
    '/',
    authenticate(),
    requireRole(ROLES.ADMIN, ROLES.MANAGER),
    validate({ body: CreateContractBody }),
    (_req, _res, next) => next(new NotImplementedError('Create contract')),
  );

  router.get(
    '/:id',
    authenticate(),
    requireRole(ROLES.ADMIN, ROLES.MANAGER, ROLES.ANALYST, ROLES.AUDITOR),
    validate({ params: ContractIdParam }),
    (_req, _res, next) => next(new NotImplementedError('Get contract')),
  );

  router.post(
    '/:id/sign',
    authenticate(),
    requireRole(ROLES.ADMIN, ROLES.MANAGER),
    validate({ params: ContractIdParam, body: SignContractBody }),
    (_req, _res, next) => next(new NotImplementedError('Sign contract')),
  );

  router.get(
    '/:id/verify',
    authenticate(),
    requireRole(ROLES.ADMIN, ROLES.MANAGER, ROLES.AUDITOR),
    validate({ params: ContractIdParam }),
    (_req, _res, next) => next(new NotImplementedError('Verify contract hash')),
  );

  return router;
}
