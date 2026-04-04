import 'dotenv/config';
import { createApp } from './app';
import { logger } from './logger';
import { validateEnv } from './validateEnv';

// ---------------------------------------------------------------------------
// Validate required environment variables at startup
// ---------------------------------------------------------------------------
validateEnv();

const app = createApp();

const PORT = process.env.PORT ?? 3001;

app.listen(PORT, () => {
  logger.info({ port: PORT }, `Server running on port ${PORT}`);
});

export default app;
