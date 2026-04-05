import 'dotenv/config';
import { createApp } from './app';
import { logger } from './logger';
import { validateEnv } from './validateEnv';
import { initializeKeyProvider } from './services/keyProvider';

// ---------------------------------------------------------------------------
// Validate required environment variables at startup
// ---------------------------------------------------------------------------
validateEnv();

const app = createApp();

const PORT = process.env.PORT ?? 3001;

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

  app.listen(PORT, () => {
    logger.info({ port: PORT }, `Server running on port ${PORT}`);
  });
})();

export default app;
