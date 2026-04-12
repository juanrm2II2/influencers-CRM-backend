/**
 * Column-level field encryption using AWS KMS envelope encryption.
 *
 * Uses AWS KMS to generate/decrypt data encryption keys (DEKs), then
 * encrypts individual field values with AES-256-GCM locally.  The
 * encrypted output is stored as a base64-encoded JSON envelope that
 * bundles the ciphertext, IV, auth tag, and encrypted DEK so each
 * value is independently decryptable.
 *
 * When `FIELD_ENCRYPTION_KMS_KEY_ID` is not set the service operates
 * in **passthrough** mode — values are returned unchanged.  This
 * allows development environments to run without AWS credentials.
 *
 * @module fieldEncryption
 */

import { createCipheriv, createDecipheriv, randomBytes } from 'crypto';
import { logger } from '../logger';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** JSON structure persisted in encrypted columns. */
export interface EncryptedEnvelope {
  /** Format version for future-proofing. */
  v: 1;
  /** Base64-encoded encrypted DEK (ciphertext blob from KMS). */
  dek: string;
  /** Base64-encoded initialisation vector (96-bit for GCM). */
  iv: string;
  /** Base64-encoded AES-GCM authentication tag. */
  tag: string;
  /** Base64-encoded ciphertext. */
  ct: string;
}

// ---------------------------------------------------------------------------
// KMS helpers (lazy-loaded)
// ---------------------------------------------------------------------------

async function generateDataKey(
  kmsKeyId: string,
  region: string,
): Promise<{ plaintext: Buffer; ciphertextBlob: Buffer }> {
  const { KMSClient, GenerateDataKeyCommand } = await import(
    '@aws-sdk/client-kms'
  );
  const client = new KMSClient({ region });
  const cmd = new GenerateDataKeyCommand({
    KeyId: kmsKeyId,
    KeySpec: 'AES_256',
  });
  const res = await client.send(cmd);

  if (!res.Plaintext || !res.CiphertextBlob) {
    throw new Error('KMS GenerateDataKey returned empty key material');
  }

  return {
    plaintext: Buffer.from(res.Plaintext),
    ciphertextBlob: Buffer.from(res.CiphertextBlob),
  };
}

async function decryptDataKey(
  ciphertextBlob: Buffer,
  region: string,
): Promise<Buffer> {
  const { KMSClient, DecryptCommand } = await import('@aws-sdk/client-kms');
  const client = new KMSClient({ region });
  const cmd = new DecryptCommand({ CiphertextBlob: ciphertextBlob });
  const res = await client.send(cmd);

  if (!res.Plaintext) {
    throw new Error('KMS Decrypt returned empty plaintext');
  }

  return Buffer.from(res.Plaintext);
}

// ---------------------------------------------------------------------------
// AES-256-GCM helpers
// ---------------------------------------------------------------------------

const ALGORITHM = 'aes-256-gcm' as const;
const IV_LENGTH = 12; // 96-bit IV recommended for GCM
const TAG_LENGTH = 16; // 128-bit auth tag

function aesEncrypt(
  plaintext: string,
  key: Buffer,
): { iv: Buffer; tag: Buffer; ciphertext: Buffer } {
  const iv = randomBytes(IV_LENGTH);
  const cipher = createCipheriv(ALGORITHM, key, iv, {
    authTagLength: TAG_LENGTH,
  });
  const encrypted = Buffer.concat([
    cipher.update(plaintext, 'utf8'),
    cipher.final(),
  ]);
  const tag = cipher.getAuthTag();
  return { iv, tag, ciphertext: encrypted };
}

function aesDecrypt(
  ciphertext: Buffer,
  key: Buffer,
  iv: Buffer,
  tag: Buffer,
): string {
  const decipher = createDecipheriv(ALGORITHM, key, iv, {
    authTagLength: TAG_LENGTH,
  });
  decipher.setAuthTag(tag);
  const decrypted = Buffer.concat([
    decipher.update(ciphertext),
    decipher.final(),
  ]);
  return decrypted.toString('utf8');
}

// ---------------------------------------------------------------------------
// FieldEncryptionService
// ---------------------------------------------------------------------------

export class FieldEncryptionService {
  private readonly kmsKeyId: string | undefined;
  private readonly region: string;

  constructor(opts?: { kmsKeyId?: string; region?: string }) {
    this.kmsKeyId =
      opts?.kmsKeyId ?? process.env.FIELD_ENCRYPTION_KMS_KEY_ID;
    this.region =
      opts?.region ?? process.env.AWS_REGION ?? 'us-east-1';
  }

  /** Whether column-level encryption is enabled. */
  get enabled(): boolean {
    return !!this.kmsKeyId;
  }

  // ---- encrypt ----------------------------------------------------------

  /**
   * Encrypt a single string value.
   *
   * Returns the original value unchanged when encryption is disabled.
   */
  async encryptField(value: string): Promise<string> {
    if (!this.kmsKeyId) return value;

    const { plaintext, ciphertextBlob } = await generateDataKey(
      this.kmsKeyId,
      this.region,
    );

    try {
      const { iv, tag, ciphertext } = aesEncrypt(value, plaintext);

      const envelope: EncryptedEnvelope = {
        v: 1,
        dek: ciphertextBlob.toString('base64'),
        iv: iv.toString('base64'),
        tag: tag.toString('base64'),
        ct: ciphertext.toString('base64'),
      };

      return JSON.stringify(envelope);
    } finally {
      // Zero out the plaintext DEK from memory.
      plaintext.fill(0);
    }
  }

  /**
   * Encrypt specific fields of a record in-place.
   *
   * Only non-null string values are encrypted.  Numeric or null fields
   * are left untouched.
   */
  async encryptFields<T extends Record<string, unknown>>(
    record: T,
    fieldNames: readonly string[],
  ): Promise<T> {
    if (!this.kmsKeyId) return record;

    const result = { ...record };

    for (const field of fieldNames) {
      const val = result[field];
      if (typeof val === 'string') {
        (result as Record<string, unknown>)[field] = await this.encryptField(val);
      }
    }

    return result;
  }

  // ---- decrypt ----------------------------------------------------------

  /**
   * Decrypt a single encrypted envelope string.
   *
   * Returns the original value unchanged when encryption is disabled
   * or the value is not a valid envelope.
   */
  async decryptField(value: string): Promise<string> {
    if (!this.kmsKeyId) return value;

    const envelope = this.parseEnvelope(value);
    if (!envelope) return value; // not encrypted — return as-is

    const ciphertextBlob = Buffer.from(envelope.dek, 'base64');
    const plaintext = await decryptDataKey(ciphertextBlob, this.region);

    try {
      return aesDecrypt(
        Buffer.from(envelope.ct, 'base64'),
        plaintext,
        Buffer.from(envelope.iv, 'base64'),
        Buffer.from(envelope.tag, 'base64'),
      );
    } finally {
      plaintext.fill(0);
    }
  }

  /**
   * Decrypt specific fields of a record in-place.
   *
   * Only non-null string values that look like encrypted envelopes
   * are decrypted.
   */
  async decryptFields<T extends Record<string, unknown>>(
    record: T,
    fieldNames: readonly string[],
  ): Promise<T> {
    if (!this.kmsKeyId) return record;

    const result = { ...record };

    for (const field of fieldNames) {
      const val = result[field];
      if (typeof val === 'string') {
        (result as Record<string, unknown>)[field] = await this.decryptField(val);
      }
    }

    return result;
  }

  // ---- helpers ----------------------------------------------------------

  /** Try to parse a string as an encrypted envelope; return null on failure. */
  private parseEnvelope(value: string): EncryptedEnvelope | null {
    try {
      const parsed: unknown = JSON.parse(value);
      if (
        typeof parsed === 'object' &&
        parsed !== null &&
        (parsed as Record<string, unknown>).v === 1 &&
        typeof (parsed as Record<string, unknown>).dek === 'string' &&
        typeof (parsed as Record<string, unknown>).iv === 'string' &&
        typeof (parsed as Record<string, unknown>).tag === 'string' &&
        typeof (parsed as Record<string, unknown>).ct === 'string'
      ) {
        return parsed as EncryptedEnvelope;
      }
    } catch {
      // Not JSON — not an envelope
    }
    return null;
  }
}

// ---------------------------------------------------------------------------
// Singleton
// ---------------------------------------------------------------------------

let _instance: FieldEncryptionService | null = null;

/** Return (or create) the singleton encryption service. */
export function getFieldEncryptionService(): FieldEncryptionService {
  if (!_instance) {
    _instance = new FieldEncryptionService();
    if (_instance.enabled) {
      logger.info('Column-level field encryption is ENABLED');
    } else {
      logger.info(
        'Column-level field encryption is DISABLED (set FIELD_ENCRYPTION_KMS_KEY_ID to enable)',
      );
    }
  }
  return _instance;
}

/** Reset singleton (for tests / graceful shutdown). */
export function resetFieldEncryptionService(): void {
  _instance = null;
}

// Re-export helpers for testing
export { aesEncrypt, aesDecrypt, IV_LENGTH, TAG_LENGTH, ALGORITHM };
