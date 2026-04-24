/**
 * JWT Key Provider – HSM / KMS integration layer.
 *
 * This module abstracts how the JWT signing secret (symmetric) or public
 * key (asymmetric) is obtained so that production deployments can use a
 * Hardware Security Module (HSM) or a cloud Key Management Service (KMS)
 * instead of a plain environment variable — and so that the Supabase
 * project's JWT verification key can be rotated asymmetrically via JWKS.
 *
 * Supported providers (selected via the `KEY_PROVIDER` env var):
 *
 *   | Provider              | `KEY_PROVIDER` value    | Required env vars                          |
 *   |-----------------------|-------------------------|--------------------------------------------|
 *   | Environment variable  | `env` *(default)*       | `SUPABASE_JWT_SECRET`                      |
 *   | AWS KMS (envelope)    | `aws-kms`               | `KMS_KEY_ID`, `KMS_ENCRYPTED_SECRET`       |
 *   | AWS Secrets Manager   | `aws-secrets-manager`   | `AWS_SECRET_ARN`                           |
 *   | RS256 PEM             | `rs256-pem`             | `JWT_PUBLIC_KEY_PEM`                       |
 *   | RS256 JWKS            | `jwks`                  | `JWT_JWKS_URI`                             |
 *
 * The active provider is initialised once at startup via
 * `initializeKeyProvider()`.  The cached secret is refreshed
 * periodically (default: 1 h) for KMS-backed providers so that key
 * rotation is picked up automatically.  JWKS-backed providers delegate
 * caching and rotation to `jwks-rsa`.
 *
 * @module keyProvider
 */

import type { Algorithm, Secret, GetPublicKeyOrSecret } from 'jsonwebtoken';
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

  /** Return the current JWT signing secret (symmetric providers only). */
  getSecret(): Promise<string>;

  /**
   * Return the verification key or a key-resolver callback suitable for
   * `jsonwebtoken`'s `verify()`.  Asymmetric providers override this to
   * return the public key (PEM) or a JWKS-backed callback.
   *
   * The default implementation delegates to `getSecret()` so existing
   * symmetric providers do not have to implement it.
   */
  getVerificationKey?(): Promise<Secret | GetPublicKeyOrSecret>;

  /**
   * Algorithms the provider is configured to verify.  Pinning this list
   * per-provider prevents algorithm-confusion attacks (e.g. an RS256
   * public key being accepted as an HS256 shared secret).
   */
  getAlgorithms(): Algorithm[];

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

  getAlgorithms(): Algorithm[] {
    return ['HS256'];
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
      const missing = [
        !keyId && 'KMS_KEY_ID',
        !encrypted && 'KMS_ENCRYPTED_SECRET',
      ].filter(Boolean);
      throw new Error(
        `Missing required env vars for aws-kms provider: ${missing.join(', ')}`,
      );
    }

    this.keyId = keyId;
    this.encryptedSecret = Buffer.from(encrypted, 'base64');
    this.region = region;
  }

  async initialize(): Promise<void> {
    await this.refresh();

    this.refreshTimer = setInterval(() => {
      this.refresh().catch(() => {
        logger.error(
          { provider: this.name },
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

  getAlgorithms(): Algorithm[] {
    return ['HS256'];
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
        'Missing required env var for aws-secrets-manager provider: AWS_SECRET_ARN',
      );
    }

    this.secretArn = arn;
    this.secretKey = process.env.AWS_SECRET_KEY;
    this.region = region;
  }

  async initialize(): Promise<void> {
    await this.refresh();

    this.refreshTimer = setInterval(() => {
      this.refresh().catch(() => {
        logger.error(
          { provider: this.name },
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

  getAlgorithms(): Algorithm[] {
    return ['HS256'];
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
// RsaPemKeyProvider – asymmetric RS256 with a static PEM public key
// ---------------------------------------------------------------------------

/**
 * Verifies JWTs using an RSA public key supplied as PEM text.
 *
 * Required env vars:
 *   - `JWT_PUBLIC_KEY_PEM` – The PEM-encoded RSA public key.  Newlines may
 *     be encoded as literal `\n` (they will be decoded at load time), so the
 *     key can be stored on a single line in `.env` files or secret stores.
 *
 * This provider only supports **verification** — it cannot sign tokens and
 * therefore throws from `getSecret()`.  Algorithms are pinned to `RS256`.
 */
export class RsaPemKeyProvider implements JwtKeyProvider {
  readonly name = 'rs256-pem';

  private publicKey: string | null = null;

  async initialize(): Promise<void> {
    const raw = process.env.JWT_PUBLIC_KEY_PEM;
    if (!raw) {
      throw new Error(
        'Missing required env var for rs256-pem provider: JWT_PUBLIC_KEY_PEM',
      );
    }
    // Support both literal newlines and escaped "\n" sequences.
    const pem = raw.includes('\\n') ? raw.replace(/\\n/g, '\n') : raw;
    if (!/-----BEGIN [A-Z ]*PUBLIC KEY-----/.test(pem)) {
      throw new Error('JWT_PUBLIC_KEY_PEM does not look like a PEM public key');
    }
    this.publicKey = pem;
    logger.info({ provider: this.name }, 'JWT key provider initialized');
  }

  async getSecret(): Promise<string> {
    throw new Error(
      'rs256-pem provider does not expose a signing secret (asymmetric, verify-only)',
    );
  }

  async getVerificationKey(): Promise<Secret> {
    if (!this.publicKey) {
      throw new Error('Key provider not initialized');
    }
    return this.publicKey;
  }

  getAlgorithms(): Algorithm[] {
    return ['RS256'];
  }

  destroy(): void {
    /* nothing to clean up */
  }
}

// ---------------------------------------------------------------------------
// JwksKeyProvider – asymmetric RS256 with a remote JWKS endpoint
// ---------------------------------------------------------------------------

/**
 * Verifies JWTs using a JWKS endpoint (e.g. the one Supabase exposes once a
 * project is migrated to asymmetric JWT signing).
 *
 * Required env vars:
 *   - `JWT_JWKS_URI` – URL to a standards-compliant JWKS document.
 *
 * The provider returns a `GetPublicKeyOrSecret` callback compatible with
 * `jsonwebtoken.verify()` that looks up the signing key by the JWT's `kid`
 * header.  Key caching, rate-limiting and rotation are delegated to the
 * `jwks-rsa` library.
 *
 * Algorithms are pinned to `RS256` to prevent algorithm-confusion attacks.
 */
export class JwksKeyProvider implements JwtKeyProvider {
  readonly name = 'jwks';

  private client: {
    getSigningKey: (kid: string) => Promise<{ getPublicKey: () => string }>;
  } | null = null;
  private readonly jwksUri: string;

  constructor() {
    const uri = process.env.JWT_JWKS_URI;
    if (!uri) {
      throw new Error(
        'Missing required env var for jwks provider: JWT_JWKS_URI',
      );
    }
    this.jwksUri = uri;
  }

  async initialize(): Promise<void> {
    // Dynamic import keeps `jwks-rsa` optional for projects on HS256.
    const jwksRsa = await import('jwks-rsa');
    const factory =
      (jwksRsa as unknown as { default?: typeof jwksRsa }).default ?? jwksRsa;
    this.client = (factory as unknown as (o: unknown) => typeof this.client)({
      jwksUri: this.jwksUri,
      cache: true,
      cacheMaxEntries: 10,
      cacheMaxAge: 10 * 60 * 1000, // 10 min
      rateLimit: true,
      jwksRequestsPerMinute: 10,
    });
    logger.info(
      { provider: this.name, jwksUri: this.jwksUri },
      'JWT key provider initialized',
    );
  }

  async getSecret(): Promise<string> {
    throw new Error(
      'jwks provider does not expose a signing secret (asymmetric, verify-only)',
    );
  }

  async getVerificationKey(): Promise<GetPublicKeyOrSecret> {
    if (!this.client) {
      throw new Error('Key provider not initialized');
    }
    const client = this.client;
    return (header, callback) => {
      if (!header.kid) {
        callback(new Error('JWT header is missing "kid"'));
        return;
      }
      client
        .getSigningKey(header.kid)
        .then((key) => callback(null, key.getPublicKey()))
        .catch((err) => callback(err as Error));
    };
  }

  getAlgorithms(): Algorithm[] {
    return ['RS256'];
  }

  destroy(): void {
    this.client = null;
  }
}

// ---------------------------------------------------------------------------
// Factory & singleton
// ---------------------------------------------------------------------------

/** Names recognised by `createKeyProvider()`. */
export type KeyProviderName =
  | 'env'
  | 'aws-kms'
  | 'aws-secrets-manager'
  | 'rs256-pem'
  | 'jwks';

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
    case 'rs256-pem':
      return new RsaPemKeyProvider();
    case 'jwks':
      return new JwksKeyProvider();
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
 *
 * Throws for asymmetric (verify-only) providers.
 */
export async function getJwtSecret(): Promise<string> {
  if (!_provider) {
    _provider = new EnvKeyProvider();
    await _provider.initialize();
  }
  return _provider.getSecret();
}

/**
 * Return the key or key-resolver callback used to *verify* JWTs.
 *
 * For symmetric providers (`env`, `aws-kms`, `aws-secrets-manager`) this is
 * the shared secret.  For asymmetric providers this is either the public
 * key PEM (`rs256-pem`) or a callback that resolves the signing key from a
 * JWKS document (`jwks`).
 */
export async function getJwtVerificationKey(): Promise<
  Secret | GetPublicKeyOrSecret
> {
  if (!_provider) {
    _provider = new EnvKeyProvider();
    await _provider.initialize();
  }
  if (_provider.getVerificationKey) {
    return _provider.getVerificationKey();
  }
  return _provider.getSecret();
}

/**
 * Return the list of algorithms accepted for verification.  Pinned
 * per-provider to prevent algorithm-confusion attacks.
 */
export function getJwtAlgorithms(): Algorithm[] {
  if (!_provider) {
    return ['HS256'];
  }
  return _provider.getAlgorithms();
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
