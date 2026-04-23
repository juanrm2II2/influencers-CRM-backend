import { Router, type Request, type Response, type NextFunction } from 'express';
import crypto from 'node:crypto';
import { NotImplementedError, UnauthorizedError } from '../../utils/errors';
import { logger } from '../../config/logger';

/**
 * Webhook endpoints are unauthenticated in the Express auth sense — they
 * use their own signature verification. All routes here must:
 *   1) read the raw body (not JSON-parsed) for HMAC verification,
 *   2) verify the signature in constant time,
 *   3) record the delivery for idempotency (by provider delivery-id),
 *   4) return 2xx only after the event is durably persisted.
 */

const MAX_AGE_SECONDS = 300;

function verifyHmacSignature(opts: {
  secret: string;
  rawBody: Buffer;
  signatureHeader: string | undefined;
  timestampHeader?: string | undefined;
}): void {
  if (!opts.signatureHeader) throw new UnauthorizedError('Missing signature');

  if (opts.timestampHeader) {
    const ts = Number(opts.timestampHeader);
    if (!Number.isFinite(ts)) throw new UnauthorizedError('Invalid timestamp');
    const skew = Math.abs(Math.floor(Date.now() / 1000) - ts);
    if (skew > MAX_AGE_SECONDS) throw new UnauthorizedError('Timestamp outside tolerance');
  }

  const signed = opts.timestampHeader
    ? Buffer.concat([Buffer.from(`${opts.timestampHeader}.`), opts.rawBody])
    : opts.rawBody;

  const expected = crypto.createHmac('sha256', opts.secret).update(signed).digest('hex');
  const provided = opts.signatureHeader.replace(/^sha256=/, '');
  if (
    expected.length !== provided.length ||
    !crypto.timingSafeEqual(Buffer.from(expected, 'hex'), Buffer.from(provided, 'hex'))
  ) {
    throw new UnauthorizedError('Bad signature');
  }
}

export function webhooksRouter(): Router {
  const router = Router();

  router.post('/scrapecreators', (req: Request, _res: Response, next: NextFunction) => {
    try {
      // Real secret will be loaded from env in a later phase.
      const secret = process.env.SCRAPECREATORS_WEBHOOK_SECRET;
      if (secret) {
        verifyHmacSignature({
          secret,
          rawBody: (req as Request & { rawBody?: Buffer }).rawBody ?? Buffer.from(''),
          signatureHeader: req.header('x-signature') ?? undefined,
          timestampHeader: req.header('x-timestamp') ?? undefined,
        });
      } else {
        logger.warn('SCRAPECREATORS_WEBHOOK_SECRET not set; rejecting webhook');
        throw new UnauthorizedError('Webhook not configured');
      }
      return next(new NotImplementedError('ScrapeCreators webhook handler'));
    } catch (err) {
      next(err);
    }
  });

  router.post('/kyc/:provider', (req: Request, _res: Response, next: NextFunction) => {
    try {
      const secretEnvKey = `KYC_WEBHOOK_SECRET_${req.params.provider.toUpperCase()}`;
      const secret = process.env[secretEnvKey];
      if (secret) {
        verifyHmacSignature({
          secret,
          rawBody: (req as Request & { rawBody?: Buffer }).rawBody ?? Buffer.from(''),
          signatureHeader: req.header('x-signature') ?? undefined,
          timestampHeader: req.header('x-timestamp') ?? undefined,
        });
      } else {
        logger.warn({ provider: req.params.provider }, 'KYC webhook secret not set');
        throw new UnauthorizedError('Webhook not configured');
      }
      return next(new NotImplementedError(`KYC webhook: ${req.params.provider}`));
    } catch (err) {
      next(err);
    }
  });

  return router;
}
