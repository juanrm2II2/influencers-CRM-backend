import { logger } from './logger';

/**
 * Required environment variables that must be set regardless of provider.
 */
const REQUIRED_ENV_VARS = [
  'SUPABASE_URL',
  'SUPABASE_SERVICE_KEY',
  'SCRAPECREATORS_API_KEY',
] as const;

/**
 * Additional env vars required per key-provider type.
 *
 * When `KEY_PROVIDER` is unset or `'env'` the JWT secret itself must be
 * present as an env var.  Cloud providers need their own configuration
 * instead.
 */
const PROVIDER_REQUIRED_VARS: Record<string, readonly string[]> = {
  env: ['SUPABASE_JWT_SECRET'],
  'aws-kms': ['KMS_KEY_ID', 'KMS_ENCRYPTED_SECRET'],
  'aws-secrets-manager': ['AWS_SECRET_ARN'],
};

/**
 * Validates that all required environment variables are present.
 * Throws an error at startup if any are missing, preventing the app from
 * running in a misconfigured state.
 *
 * Provider-specific vars are checked based on the `KEY_PROVIDER` env var
 * (defaults to `'env'`).
 */
export function validateEnv(): void {
  const missing = REQUIRED_ENV_VARS.filter((key) => !process.env[key]);

  const provider = process.env.KEY_PROVIDER ?? 'env';
  const providerVars = PROVIDER_REQUIRED_VARS[provider];

  if (!providerVars) {
    const message = `Unknown KEY_PROVIDER "${provider}". Supported: ${Object.keys(PROVIDER_REQUIRED_VARS).join(', ')}`;
    logger.fatal(message);
    throw new Error(message);
  }

  const missingProvider = providerVars.filter((key) => !process.env[key]);
  const allMissing = [...missing, ...missingProvider];

  if (allMissing.length > 0) {
    const message = `Missing required environment variables: ${allMissing.join(', ')}`;
    logger.fatal(message);
    throw new Error(message);
  }

  logger.info({ keyProvider: provider }, 'All required environment variables are present');

  // Optional: warn about field-level encryption configuration
  if (process.env.FIELD_ENCRYPTION_KMS_KEY_ID) {
    logger.info('Column-level PII field encryption is configured');
  }
}
