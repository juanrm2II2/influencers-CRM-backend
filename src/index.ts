import 'dotenv/config';
import { createApp } from './app';
import { logger } from './logger';
import { validateEnv } from './validateEnv';
import { initializeKeyProvider, destroyKeyProvider } from './services/keyProvider';

// ---------------------------------------------------------------------------
// Validate required environment variables at startup
// ---------------------------------------------------------------------------
validateEnv();

const app = createApp();

const PORT = process.env.PORT ?? 3001;

// ---------------------------------------------------------------------------
// Global error handlers — log fatal errors and exit cleanly
// ---------------------------------------------------------------------------
process.on('unhandledRejection', (reason) => {
  logger.fatal({ err: reason }, 'Unhandled promise rejection');
  process.exit(1);
});

process.on('uncaughtException', (err) => {
  logger.fatal({ err }, 'Uncaught exception');
  process.exit(1);
});

// ---------------------------------------------------------------------------
// Async bootstrap: initialise the key provider (env / KMS / Secrets Manager)
// then start the HTTP server.
// ---------------------------------------------------------------------------
(async () => {
  try {
    await initializeKeyProvider();
  } catch (err) {
    logger.fatal({ err }, 'Failed to initialize JWT key provider');
    process.exit(1);
  }

  const server = app.listen(PORT, () => {
    logger.info({ port: PORT }, `Server running on port ${PORT}`);
  });

  // -------------------------------------------------------------------------
  // Graceful shutdown on SIGTERM / SIGINT
  // -------------------------------------------------------------------------
  const shutdown = (signal: string) => {
    logger.info({ signal }, 'Received shutdown signal, closing server…');
    server.close(() => {
      logger.info('HTTP server closed');
      destroyKeyProvider();
      process.exit(0);
    });
  };

  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));
})();

export default app;
