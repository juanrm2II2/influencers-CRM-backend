import { logger } from './logger';

/**
 * Required environment variables that must be set regardless of provider.
 */
const REQUIRED_ENV_VARS = [
  'SUPABASE_URL',
  'SUPABASE_SERVICE_KEY',
  'SUPABASE_ANON_KEY',
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
  'rs256-pem': ['JWT_PUBLIC_KEY_PEM'],
  jwks: ['JWT_JWKS_URI'],
};

/**
 * Validates that all required environment variables are present.
 * Throws an error at startup if any are missing, preventing the app from
 * running in a misconfigured state.
 *
 * Provider-specific vars are checked based on the `KEY_PROVIDER` env var
 * (defaults to `'env'`).
 *
 * In `NODE_ENV=production`, the symmetric `env` provider is rejected
 * unless `ALLOW_INSECURE_KEY_PROVIDER=true` is explicitly set, because a
 * leaked `SUPABASE_JWT_SECRET` lets an attacker forge `role=admin` tokens
 * (audit M10).  Production deployments must use an asymmetric provider
 * (`jwks` / `rs256-pem`) or one of the KMS-backed symmetric providers.
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

  // Refuse to boot the symmetric `env` provider in production unless the
  // operator explicitly opts in (audit M10).
  if (
    process.env.NODE_ENV === 'production' &&
    provider === 'env' &&
    process.env.ALLOW_INSECURE_KEY_PROVIDER !== 'true'
  ) {
    const message =
      'KEY_PROVIDER=env (HS256 shared secret) is not permitted in production. ' +
      'Use jwks, rs256-pem, aws-kms, or aws-secrets-manager.  Override with ' +
      'ALLOW_INSECURE_KEY_PROVIDER=true only for emergency rollbacks.';
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
