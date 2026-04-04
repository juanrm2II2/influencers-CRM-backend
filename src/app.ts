import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import influencerRoutes from './routes/influencers';
import { errorHandler } from './middleware/errorHandler';

/**
 * Creates and configures the Express application.
 * Separated from server startup to enable testing without open handles.
 */
export function createApp(): express.Express {
  const app = express();

  // ---------------------------------------------------------------------------
  // Security headers
  // ---------------------------------------------------------------------------
  app.use(helmet());

  // ---------------------------------------------------------------------------
  // CORS — restrict to configured origins (defaults to localhost in dev)
  // ---------------------------------------------------------------------------
  const ALLOWED_ORIGINS = process.env.CORS_ALLOWED_ORIGINS
    ? process.env.CORS_ALLOWED_ORIGINS.split(',').map((o) => o.trim())
    : ['http://localhost:3000'];

  app.use(
    cors({
      origin: ALLOWED_ORIGINS,
      methods: ['GET', 'POST', 'PATCH', 'DELETE', 'OPTIONS'],
      allowedHeaders: ['Content-Type', 'Authorization'],
      maxAge: 86400, // preflight cache 24 hours
    })
  );

  // ---------------------------------------------------------------------------
  // Body parsing with size limit
  // ---------------------------------------------------------------------------
  app.use(express.json({ limit: '1mb' }));

  // ---------------------------------------------------------------------------
  // Global rate limiter
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

  // ---------------------------------------------------------------------------
  // Protected API routes
  // ---------------------------------------------------------------------------
  app.use('/api/influencers', influencerRoutes);

  // ---------------------------------------------------------------------------
  // Centralized error handler (must be registered last)
  // ---------------------------------------------------------------------------
  app.use(errorHandler);

  return app;
}
