import { logger } from './logger';

/**
 * Required environment variables that must be set before the application starts.
 */
const REQUIRED_ENV_VARS = [
  'SUPABASE_URL',
  'SUPABASE_SERVICE_KEY',
  'SUPABASE_JWT_SECRET',
  'SCRAPECREATORS_API_KEY',
] as const;

/**
 * Validates that all required environment variables are present.
 * Throws an error at startup if any are missing, preventing the app from
 * running in a misconfigured state.
 */
export function validateEnv(): void {
  const missing = REQUIRED_ENV_VARS.filter((key) => !process.env[key]);

  if (missing.length > 0) {
    const message = `Missing required environment variables: ${missing.join(', ')}`;
    logger.fatal(message);
    throw new Error(message);
  }

  logger.info('All required environment variables are present');
}
