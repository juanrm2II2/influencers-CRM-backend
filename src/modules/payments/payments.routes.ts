import { Router } from 'express';
import { z } from 'zod';
import { ROLES, authenticate, requireRole } from '../../middleware/auth';
import { validate } from '../../middleware/validate';
import { NotImplementedError } from '../../utils/errors';
import { PaginationQuerySchema } from '../../utils/pagination';

const PaymentIdParam = z.object({ id: z.string().uuid() });

const PaymentMethod = z.enum(['bank_transfer', 'stripe', 'crypto']);
const Currency = z.string().length(3);

/**
 * Base fields common to every payment method.
 */
const BasePaymentBody = z.object({
  campaignId: z.string().uuid(),
  influencerId: z.string().uuid(),
  amountCents: z.number().int().positive().max(1e15),
  currency: Currency,
  reference: z.string().trim().max(200).optional(),
});

/**
 * Payment body is a discriminated union so crypto-specific fields are
 * required when `method: 'crypto'` and absent otherwise. This keeps the
 * ICO-readiness stubs strongly typed without loosening fiat validation.
 */
const CreatePaymentBody = z.discriminatedUnion('method', [
  BasePaymentBody.extend({
    method: z.literal('bank_transfer'),
  }),
  BasePaymentBody.extend({
    method: z.literal('stripe'),
  }),
  BasePaymentBody.extend({
    method: z.literal('crypto'),
    chain: z.enum(['evm', 'solana']),
    token: z.string().trim().min(2).max(16), // e.g. USDC, ETH, SOL
    walletAddress: z
      .string()
      .trim()
      .min(10)
      .max(128)
      .regex(/^[A-Za-z0-9]+$/),
  }),
]);

const ListPaymentsQuery = PaginationQuerySchema.extend({
  campaignId: z.string().uuid().optional(),
  influencerId: z.string().uuid().optional(),
  method: PaymentMethod.optional(),
  status: z.enum(['pending', 'processing', 'settled', 'failed', 'refunded']).optional(),
});

export function paymentsRouter(): Router {
  const router = Router();

  router.get(
    '/',
    authenticate(),
    requireRole(ROLES.ADMIN, ROLES.MANAGER, ROLES.AUDITOR),
    validate({ query: ListPaymentsQuery }),
    (_req, _res, next) => next(new NotImplementedError('List payments')),
  );

  router.post(
    '/',
    authenticate(),
    requireRole(ROLES.ADMIN, ROLES.MANAGER),
    validate({ body: CreatePaymentBody }),
    (_req, _res, next) => next(new NotImplementedError('Create payment')),
  );

  router.get(
    '/:id',
    authenticate(),
    requireRole(ROLES.ADMIN, ROLES.MANAGER, ROLES.AUDITOR),
    validate({ params: PaymentIdParam }),
    (_req, _res, next) => next(new NotImplementedError('Get payment')),
  );

  router.post(
    '/:id/reconcile',
    authenticate(),
    requireRole(ROLES.ADMIN, ROLES.MANAGER),
    validate({ params: PaymentIdParam }),
    (_req, _res, next) => next(new NotImplementedError('Reconcile payment')),
  );

  return router;
}
