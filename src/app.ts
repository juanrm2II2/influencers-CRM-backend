import express from 'express';
import cors, { CorsOptions } from 'cors';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import influencerRoutes from './routes/influencers';
import authRoutes from './routes/auth';
import privacyRoutes from './routes/privacy';
import { errorHandler } from './middleware/errorHandler';
import { requireHttps } from './middleware/requireHttps';
import { requestId } from './middleware/requestId';
import { enforceJsonContentType } from './middleware/contentType';
import { logger } from './logger';
import { supabase } from './services/supabase';
import { getJwtVerificationKey } from './services/keyProvider';

/**
 * Creates and configures the Express application.
 * Separated from server startup to enable testing without open handles.
 */
export function createApp(): express.Express {
  const app = express();

  // ---------------------------------------------------------------------------
  // Trust proxy — required so that `req.secure`, `req.ip`, and rate-limit
  // keys reflect the actual client when fronted by an HTTPS load-balancer
  // (M4).  Configurable via `TRUST_PROXY` env (number of hops, comma-list of
  // CIDRs, or `false` to disable).  Defaults to one hop, suitable for the
  // typical single-LB topology.
  // ---------------------------------------------------------------------------
  const trustProxy = process.env.TRUST_PROXY ?? '1';
  if (trustProxy === 'false' || trustProxy === '0') {
    app.set('trust proxy', false);
  } else if (/^\d+$/.test(trustProxy)) {
    app.set('trust proxy', parseInt(trustProxy, 10));
  } else {
    app.set('trust proxy', trustProxy);
  }

  // ---------------------------------------------------------------------------
  // TLS / HTTPS enforcement (production only)
  // ---------------------------------------------------------------------------
  app.use(requireHttps);

  // ---------------------------------------------------------------------------
  // Request-ID correlation (must be early so all downstream logs include it)
  // ---------------------------------------------------------------------------
  app.use(requestId);

  // ---------------------------------------------------------------------------
  // Security headers — explicit policies for investor-facing deployment (M5)
  //
  //  * Content-Security-Policy: locked down to `'none'` (this is an API; no
  //    HTML rendering).  An attacker can no longer probe CSP gaps to launch
  //    XSS / clickjacking via reflected error pages.
  //  * Strict-Transport-Security: 2 years + includeSubDomains + preload, the
  //    OWASP ASVS L2+ recommendation for token-sale-adjacent backends.
  //  * Referrer-Policy: `no-referrer` so requestIDs / IDs in URLs do not
  //    leak via the Referer header.
  //  * Cross-Origin-Opener-Policy / Cross-Origin-Resource-Policy: tightened
  //    to mitigate Spectre-class side-channels.
  // ---------------------------------------------------------------------------
  app.use(
    helmet({
      contentSecurityPolicy: {
        directives: {
          defaultSrc: ["'none'"],
          frameAncestors: ["'none'"],
        },
      },
      hsts: {
        maxAge: 63_072_000, // 2 years (in seconds)
        includeSubDomains: true,
        preload: true,
      },
      referrerPolicy: { policy: 'no-referrer' },
      crossOriginOpenerPolicy: { policy: 'same-origin' },
      crossOriginResourcePolicy: { policy: 'same-origin' },
      noSniff: true,
      frameguard: { action: 'deny' },
    })
  );

  // ---------------------------------------------------------------------------
  // CORS — function-form origin validation with structured rejection logging
  // (M3).  Disallowed origins are denied with a CORS error and logged so
  // probes / misconfigured frontends are visible in the SIEM.
  // ---------------------------------------------------------------------------
  const ALLOWED_ORIGINS = process.env.CORS_ALLOWED_ORIGINS
    ? process.env.CORS_ALLOWED_ORIGINS.split(',').map((o) => o.trim()).filter(Boolean)
    : ['http://localhost:3000'];

  const corsOptions: CorsOptions = {
    origin: (origin, callback) => {
      // Same-origin / non-browser requests have no Origin header.  Allow
      // them so health probes and server-to-server calls work, but record
      // them for awareness.
      if (!origin) {
        return callback(null, true);
      }
      if (ALLOWED_ORIGINS.includes(origin)) {
        return callback(null, true);
      }
      logger.warn({ origin }, 'CORS rejection — origin not in allow-list');
      return callback(new Error('Not allowed by CORS'));
    },
    methods: ['GET', 'POST', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
    maxAge: 86400, // preflight cache 24 hours
  };

  app.use(cors(corsOptions));

  // ---------------------------------------------------------------------------
  // Strict JSON Content-Type enforcement (M2).  `express.json()` with no
  // `type` option happily parses any body that *looks* like JSON regardless
  // of `Content-Type` — letting attackers bypass downstream sanitisers by
  // sending `text/plain`.  We pin both the parser type and a 415 guard.
  // ---------------------------------------------------------------------------
  app.use(enforceJsonContentType);
  app.use(express.json({ type: 'application/json', limit: '1mb' }));

  // ---------------------------------------------------------------------------
  // Global rate limiter — IP-keyed baseline for unauthenticated traffic
  // ---------------------------------------------------------------------------
  app.use(
    rateLimit({
      windowMs: 15 * 60 * 1000, // 15 minutes
      max: 100, // limit each IP to 100 requests per window
      standardHeaders: true,
      legacyHeaders: false,
      message: { error: 'Too many requests, please try again later' },
    })
  );

  // ---------------------------------------------------------------------------
  // Public routes (no auth required)
  // ---------------------------------------------------------------------------
  app.get('/health', (_req, res) => {
    res.json({ status: 'ok' });
  });

  // Deep readiness probe (L3): verifies that downstream dependencies are
  // reachable.  Returns 503 when the JWT key provider or the database are
  // unavailable so load-balancers stop routing traffic to a broken pod.
  //
  // Audit L1: the probe performs a Supabase round-trip and a key-provider
  // invocation per call.  Without a dedicated limiter, anonymous traffic
  // could amplify load against KMS / the database.  Cap at 30 req / minute
  // per IP — well above any realistic load-balancer health check cadence
  // (k8s default is 10 s = 6 req/min) but tight enough to neutralise a
  // single-IP amplifier.
  const readyLimiter = rateLimit({
    windowMs: 60_000,
    max: 30,
    standardHeaders: true,
    legacyHeaders: false,
    message: { error: 'Too many readiness checks, please try again later' },
  });

  app.get('/health/ready', readyLimiter, async (_req, res) => {
    const checks: Record<string, 'ok' | 'fail'> = {};
    let healthy = true;

    try {
      await getJwtVerificationKey();
      checks.keyProvider = 'ok';
    } catch (err) {
      checks.keyProvider = 'fail';
      healthy = false;
      logger.warn({ err }, '/health/ready: key provider check failed');
    }

    try {
      // Lightweight DB round-trip.  We use the service-role client because
      // this probe must not depend on a user JWT.  `head: true` avoids
      // returning row data; `count: 'exact'` forces the query to execute.
      const { error } = await supabase
        .from('revoked_tokens')
        .select('token', { count: 'exact', head: true })
        .limit(1);
      if (error) throw error;
      checks.database = 'ok';
    } catch (err) {
      checks.database = 'fail';
      healthy = false;
      logger.warn({ err }, '/health/ready: database check failed');
    }

    res.status(healthy ? 200 : 503).json({
      status: healthy ? 'ready' : 'unavailable',
      checks,
    });
  });

  // ---------------------------------------------------------------------------
  // Protected API routes
  // ---------------------------------------------------------------------------
  app.use('/api/auth', authRoutes);
  app.use('/api/influencers', influencerRoutes);
  app.use('/api/privacy', privacyRoutes);

  // ---------------------------------------------------------------------------
  // Centralized error handler (must be registered last)
  // ---------------------------------------------------------------------------
  app.use(errorHandler);

  return app;
}
