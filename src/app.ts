import cors from 'cors';
import express, { type Express, type Request } from 'express';
import helmet from 'helmet';
import pinoHttp from 'pino-http';
import { env } from './config/env';
import { logger } from './config/logger';
import { errorHandler, notFoundHandler } from './middleware/error-handler';
import { globalRateLimiter, webhookRateLimiter } from './middleware/rate-limit';
import { requestId } from './middleware/request-id';
import { auditRouter } from './modules/audit/audit.routes';
import { authRouter } from './modules/auth/auth.routes';
import { campaignsRouter } from './modules/campaigns/campaigns.routes';
import { contractsRouter } from './modules/contracts/contracts.routes';
import { healthRouter } from './modules/health/health.routes';
import { influencerAccountsRouter } from './modules/influencer-accounts/influencer-accounts.routes';
import { influencersRouter } from './modules/influencers/influencers.routes';
import { kycRouter } from './modules/kyc/kyc.routes';
import { paymentsRouter } from './modules/payments/payments.routes';
import { reportsRouter } from './modules/reports/reports.routes';
import { usersRouter } from './modules/users/users.routes';
import { webhooksRouter } from './modules/webhooks/webhooks.routes';

/**
 * Build the Express application. No network listener is started here —
 * see `server.ts`. This split lets integration tests drive the app via
 * supertest without binding a port.
 */
export function buildApp(): Express {
  const app = express();
  const e = env();

  // trust proxy: Railway terminates TLS in front of the app, so we need
  // req.ip to reflect X-Forwarded-For for rate limits and audit logs.
  app.set('trust proxy', 1);
  app.disable('x-powered-by');

  app.use(requestId());
  app.use(
    helmet({
      // Defaults are appropriate for a JSON API (we do not serve HTML).
      // `crossOriginEmbedderPolicy` is disabled so downstream clients on
      // different origins can consume responses without extra headers.
      crossOriginEmbedderPolicy: false,
    }),
  );

  app.use(
    cors({
      origin: (origin, cb) => {
        // Allow server-to-server (no Origin header) and explicitly allow-listed origins.
        if (!origin) return cb(null, true);
        if (e.CORS_ORIGINS.includes(origin)) return cb(null, true);
        return cb(new Error(`Origin not allowed: ${origin}`));
      },
      credentials: true,
      maxAge: 600,
    }),
  );

  app.use(
    pinoHttp({
      logger,
      genReqId: (req) => (req as Request & { id?: string }).id ?? 'unknown',
      customLogLevel: (_req, res, err) => {
        if (err || res.statusCode >= 500) return 'error';
        if (res.statusCode >= 400) return 'warn';
        return 'info';
      },
    }),
  );

  // Webhook routes MUST see the raw body so HMAC signatures can be verified.
  // Register them before the JSON parser, but still allow downstream handlers
  // to access a parsed body via a dedicated middleware. A webhook-scoped rate
  // limiter protects the signature-verification path from unauthenticated DoS.
  app.use(
    '/api/v1/webhooks',
    webhookRateLimiter(),
    express.raw({ type: 'application/json', limit: '1mb' }),
    (req, _res, next) => {
      const raw = req.body as Buffer;
      (req as Request & { rawBody?: Buffer }).rawBody = raw;
      try {
        req.body = raw.length ? JSON.parse(raw.toString('utf8')) : {};
      } catch {
        req.body = {};
      }
      next();
    },
    webhooksRouter(),
  );

  app.use(express.json({ limit: '256kb' }));
  app.use(express.urlencoded({ extended: false, limit: '256kb' }));
  app.use(globalRateLimiter());

  // Health (unauthenticated, no versioning — infra tools expect stable paths).
  app.use('/health', healthRouter());

  // Versioned API.
  app.use('/api/v1/auth', authRouter());
  app.use('/api/v1/users', usersRouter());
  app.use('/api/v1/influencers', influencersRouter());
  app.use('/api/v1', influencerAccountsRouter()); // mounts /influencers/:id/accounts + /accounts/...
  app.use('/api/v1/campaigns', campaignsRouter());
  app.use('/api/v1/contracts', contractsRouter());
  app.use('/api/v1/payments', paymentsRouter());
  app.use('/api/v1/kyc', kycRouter());
  app.use('/api/v1/reports', reportsRouter());
  app.use('/api/v1/audit', auditRouter());

  app.use(notFoundHandler());
  app.use(errorHandler());

  return app;
}
