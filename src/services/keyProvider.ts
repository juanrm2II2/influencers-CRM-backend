/**
 * JWT Key Provider – HSM / KMS integration layer.
 *
 * This module abstracts how the JWT signing secret is obtained so that
 * production deployments can use a Hardware Security Module (HSM) or a
 * cloud Key Management Service (KMS) instead of a plain environment
 * variable.
 *
 * Supported providers (selected via the `KEY_PROVIDER` env var):
 *
 *   | Provider              | `KEY_PROVIDER` value    | Required env vars                          |
 *   |-----------------------|-------------------------|--------------------------------------------|
 *   | Environment variable  | `env` *(default)*       | `SUPABASE_JWT_SECRET`                      |
 *   | AWS KMS (envelope)    | `aws-kms`               | `KMS_KEY_ID`, `KMS_ENCRYPTED_SECRET`       |
 *   | AWS Secrets Manager   | `aws-secrets-manager`   | `AWS_SECRET_ARN`                           |
 *
 * The active provider is initialised once at startup via
 * `initializeKeyProvider()`.  The cached secret is refreshed
 * periodically (default: 1 h) for KMS-backed providers so that key
 * rotation is picked up automatically.
 *
 * @module keyProvider
 */

import { logger } from '../logger';

// ---------------------------------------------------------------------------
// Public interface
// ---------------------------------------------------------------------------

/**
 * Contract every key-provider implementation must satisfy.
 */
export interface JwtKeyProvider {
  /** Human-readable name used in log messages. */
  readonly name: string;

  /** One-time async initialisation (fetch initial secret, etc.). */
  initialize(): Promise<void>;

  /** Return the current JWT signing secret (may be cached). */
  getSecret(): Promise<string>;

  /** Release background resources (timers, connections). */
  destroy(): void;
}

// ---------------------------------------------------------------------------
// EnvKeyProvider – reads from an environment variable
// ---------------------------------------------------------------------------

export class EnvKeyProvider implements JwtKeyProvider {
  readonly name = 'env';
  private secret: string | undefined;

  constructor(private readonly envVar: string = 'SUPABASE_JWT_SECRET') {}

  async initialize(): Promise<void> {
    this.secret = process.env[this.envVar];
    if (!this.secret) {
      throw new Error(`Environment variable ${this.envVar} is not set`);
    }
    logger.info({ provider: this.name }, 'JWT key provider initialized');
  }

  async getSecret(): Promise<string> {
    if (!this.secret) {
      throw new Error('Key provider not initialized');
    }
    return this.secret;
  }

  destroy(): void {
    /* nothing to clean up */
  }
}

// ---------------------------------------------------------------------------
// AwsKmsKeyProvider – envelope-encryption pattern
// ---------------------------------------------------------------------------

/**
 * Decrypts the JWT secret using AWS KMS (envelope encryption).
 *
 * The encrypted secret is stored in the `KMS_ENCRYPTED_SECRET` env var as a
 * base64-encoded ciphertext blob.  At start-up the provider calls KMS
 * `Decrypt` to obtain the plaintext, which is then cached in memory.
 * A background timer re-decrypts periodically so that KMS key rotation is
 * picked up without a restart.
 *
 * Required env vars:
 *   - `KMS_KEY_ID`            – KMS key ARN, alias, or alias ARN.
 *   - `KMS_ENCRYPTED_SECRET`  – Base64-encoded ciphertext of the JWT secret.
 *   - `AWS_REGION`            – *(optional)* defaults to `us-east-1`.
 */
export class AwsKmsKeyProvider implements JwtKeyProvider {
  readonly name = 'aws-kms';

  private secret: string | null = null;
  private refreshTimer: ReturnType<typeof setInterval> | null = null;

  private readonly refreshIntervalMs: number;
  private readonly keyId: string;
  private readonly encryptedSecret: Buffer;
  private readonly region: string;

  constructor(opts?: { refreshIntervalMs?: number }) {
    this.refreshIntervalMs = opts?.refreshIntervalMs ?? 3_600_000; // 1 h

    const keyId = process.env.KMS_KEY_ID;
    const encrypted = process.env.KMS_ENCRYPTED_SECRET;
    const region = process.env.AWS_REGION ?? 'us-east-1';

    if (!keyId || !encrypted) {
      throw new Error(
        'KMS_KEY_ID and KMS_ENCRYPTED_SECRET must be set for aws-kms provider',
      );
    }

    this.keyId = keyId;
    this.encryptedSecret = Buffer.from(encrypted, 'base64');
    this.region = region;
  }

  async initialize(): Promise<void> {
    await this.refresh();

    this.refreshTimer = setInterval(() => {
      this.refresh().catch((err) => {
        logger.error(
          { err, provider: this.name },
          'Scheduled key refresh failed – keeping cached secret',
        );
      });
    }, this.refreshIntervalMs);

    /* istanbul ignore next -- unref may be undefined in some runtimes */
    if (this.refreshTimer.unref) {
      this.refreshTimer.unref();
    }

    logger.info(
      { provider: this.name, region: this.region },
      'JWT key provider initialized',
    );
  }

  async getSecret(): Promise<string> {
    if (!this.secret) {
      throw new Error('Key provider not initialized');
    }
    return this.secret;
  }

  destroy(): void {
    if (this.refreshTimer) {
      clearInterval(this.refreshTimer);
      this.refreshTimer = null;
    }
  }

  /* ---- internal ---- */

  private async refresh(): Promise<void> {
    // Dynamic import keeps @aws-sdk/client-kms optional.
    const { KMSClient, DecryptCommand } = await import('@aws-sdk/client-kms');

    const client = new KMSClient({ region: this.region });
    const command = new DecryptCommand({
      KeyId: this.keyId,
      CiphertextBlob: this.encryptedSecret,
    });

    const response = await client.send(command);

    if (!response.Plaintext) {
      throw new Error('KMS Decrypt returned empty plaintext');
    }

    this.secret = Buffer.from(response.Plaintext).toString('utf-8');
    logger.info({ provider: this.name }, 'JWT secret refreshed from KMS');
  }
}

// ---------------------------------------------------------------------------
// AwsSecretsManagerKeyProvider
// ---------------------------------------------------------------------------

/**
 * Fetches the JWT secret from AWS Secrets Manager.
 *
 * Required env vars:
 *   - `AWS_SECRET_ARN` – ARN or friendly name of the secret.
 *   - `AWS_SECRET_KEY` – *(optional)* JSON key inside the secret value.
 *                        When omitted the entire `SecretString` is used.
 *   - `AWS_REGION`     – *(optional)* defaults to `us-east-1`.
 */
export class AwsSecretsManagerKeyProvider implements JwtKeyProvider {
  readonly name = 'aws-secrets-manager';

  private secret: string | null = null;
  private refreshTimer: ReturnType<typeof setInterval> | null = null;

  private readonly refreshIntervalMs: number;
  private readonly secretArn: string;
  private readonly secretKey: string | undefined;
  private readonly region: string;

  constructor(opts?: { refreshIntervalMs?: number }) {
    this.refreshIntervalMs = opts?.refreshIntervalMs ?? 3_600_000;

    const arn = process.env.AWS_SECRET_ARN;
    const region = process.env.AWS_REGION ?? 'us-east-1';

    if (!arn) {
      throw new Error(
        'AWS_SECRET_ARN must be set for aws-secrets-manager provider',
      );
    }

    this.secretArn = arn;
    this.secretKey = process.env.AWS_SECRET_KEY;
    this.region = region;
  }

  async initialize(): Promise<void> {
    await this.refresh();

    this.refreshTimer = setInterval(() => {
      this.refresh().catch((err) => {
        logger.error(
          { err, provider: this.name },
          'Scheduled secret refresh failed – keeping cached secret',
        );
      });
    }, this.refreshIntervalMs);

    /* istanbul ignore next */
    if (this.refreshTimer.unref) {
      this.refreshTimer.unref();
    }

    logger.info(
      { provider: this.name, region: this.region },
      'JWT key provider initialized',
    );
  }

  async getSecret(): Promise<string> {
    if (!this.secret) {
      throw new Error('Key provider not initialized');
    }
    return this.secret;
  }

  destroy(): void {
    if (this.refreshTimer) {
      clearInterval(this.refreshTimer);
      this.refreshTimer = null;
    }
  }

  /* ---- internal ---- */

  private async refresh(): Promise<void> {
    const { SecretsManagerClient, GetSecretValueCommand } = await import(
      '@aws-sdk/client-secrets-manager'
    );

    const client = new SecretsManagerClient({ region: this.region });
    const command = new GetSecretValueCommand({ SecretId: this.secretArn });
    const response = await client.send(command);

    if (!response.SecretString) {
      throw new Error('Secrets Manager returned empty secret');
    }

    if (this.secretKey) {
      const parsed: Record<string, unknown> = JSON.parse(
        response.SecretString,
      );
      const value = parsed[this.secretKey];
      if (typeof value !== 'string' || value.length === 0) {
        throw new Error(
          `Key "${this.secretKey}" not found or empty in secret`,
        );
      }
      this.secret = value;
    } else {
      this.secret = response.SecretString;
    }

    logger.info(
      { provider: this.name },
      'JWT secret refreshed from Secrets Manager',
    );
  }
}

// ---------------------------------------------------------------------------
// Factory & singleton
// ---------------------------------------------------------------------------

/** Names recognised by `createKeyProvider()`. */
export type KeyProviderName = 'env' | 'aws-kms' | 'aws-secrets-manager';

/**
 * Instantiate (but do **not** initialise) a key provider.
 *
 * The provider name is taken from the `name` argument, falling back to the
 * `KEY_PROVIDER` env var, and finally to `'env'`.
 */
export function createKeyProvider(name?: KeyProviderName): JwtKeyProvider {
  const resolved =
    name ?? (process.env.KEY_PROVIDER as KeyProviderName | undefined) ?? 'env';

  switch (resolved) {
    case 'env':
      return new EnvKeyProvider();
    case 'aws-kms':
      return new AwsKmsKeyProvider();
    case 'aws-secrets-manager':
      return new AwsSecretsManagerKeyProvider();
    default:
      throw new Error(`Unknown key provider: ${resolved as string}`);
  }
}

/** Module-level singleton. */
let _provider: JwtKeyProvider | null = null;

/**
 * Initialise the global key provider.
 *
 * Must be called **once** during startup (before the first HTTP request).
 * Calling it again destroys the previous provider and replaces it.
 */
export async function initializeKeyProvider(
  name?: KeyProviderName,
): Promise<void> {
  if (_provider) {
    _provider.destroy();
  }
  _provider = createKeyProvider(name);
  await _provider.initialize();
}

/**
 * Return the current JWT signing secret.
 *
 * If no provider has been explicitly initialised (e.g. in unit tests) the
 * function transparently falls back to `EnvKeyProvider`.
 */
export async function getJwtSecret(): Promise<string> {
  if (!_provider) {
    _provider = new EnvKeyProvider();
    await _provider.initialize();
  }
  return _provider.getSecret();
}

/** Expose the active provider for monitoring / testing. */
export function getKeyProvider(): JwtKeyProvider | null {
  return _provider;
}

/** Tear down the singleton (tests / graceful shutdown). */
export function destroyKeyProvider(): void {
  if (_provider) {
    _provider.destroy();
    _provider = null;
  }
}
