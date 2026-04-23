import { randomBytes } from 'crypto';

// ---------------------------------------------------------------------------
// Mock @aws-sdk/client-kms
// ---------------------------------------------------------------------------
const mockSend = jest.fn();

jest.mock('@aws-sdk/client-kms', () => {
  return {
    KMSClient: jest.fn().mockImplementation(() => ({ send: mockSend })),
    GenerateDataKeyCommand: jest.fn().mockImplementation((input: unknown) => ({
      input,
    })),
    DecryptCommand: jest.fn().mockImplementation((input: unknown) => ({
      input,
    })),
  };
});

import {
  FieldEncryptionService,
  EncryptedEnvelope,
  getFieldEncryptionService,
  resetFieldEncryptionService,
  aesEncrypt,
  aesDecrypt,
} from '../../../src/services/fieldEncryption';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Generate a fake 256-bit DEK and its "encrypted" form. */
function fakeDataKey() {
  const plaintext = randomBytes(32);
  const ciphertextBlob = randomBytes(64); // fake ciphertext from KMS
  return { plaintext, ciphertextBlob };
}

/** Set up mockSend so GenerateDataKey and Decrypt work with a consistent key. */
function configureMocks() {
  const { plaintext, ciphertextBlob } = fakeDataKey();

  mockSend.mockImplementation((cmd: { input?: Record<string, unknown> }) => {
    // GenerateDataKeyCommand has a KeySpec property
    if (cmd.input && 'KeySpec' in cmd.input) {
      return Promise.resolve({
        Plaintext: new Uint8Array(plaintext),
        CiphertextBlob: new Uint8Array(ciphertextBlob),
      });
    }
    // DecryptCommand has a CiphertextBlob property
    if (cmd.input && 'CiphertextBlob' in cmd.input) {
      return Promise.resolve({
        Plaintext: new Uint8Array(plaintext),
      });
    }
    return Promise.reject(new Error('Unknown command'));
  });

  return { plaintext, ciphertextBlob };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('FieldEncryptionService', () => {
  afterEach(() => {
    jest.clearAllMocks();
    resetFieldEncryptionService();
  });

  // -----------------------------------------------------------------------
  // Passthrough mode (no KMS key)
  // -----------------------------------------------------------------------
  describe('passthrough mode (encryption disabled)', () => {
    let svc: FieldEncryptionService;

    beforeEach(() => {
      svc = new FieldEncryptionService({ kmsKeyId: undefined });
    });

    it('enabled should be false', () => {
      expect(svc.enabled).toBe(false);
    });

    it('encryptField returns the original value', async () => {
      const result = await svc.encryptField('hello');
      expect(result).toBe('hello');
      expect(mockSend).not.toHaveBeenCalled();
    });

    it('decryptField returns the original value', async () => {
      const result = await svc.decryptField('hello');
      expect(result).toBe('hello');
      expect(mockSend).not.toHaveBeenCalled();
    });

    it('encryptFields returns the record unchanged', async () => {
      const record = { full_name: 'Alice', bio: 'Hi', followers: 999 };
      const result = await svc.encryptFields(record, ['full_name', 'bio']);
      expect(result).toEqual(record);
    });

    it('decryptFields returns the record unchanged', async () => {
      const record = { full_name: 'Alice', bio: 'Hi', followers: 999 };
      const result = await svc.decryptFields(record, ['full_name', 'bio']);
      expect(result).toEqual(record);
    });
  });

  // -----------------------------------------------------------------------
  // Encryption mode (KMS key set)
  // -----------------------------------------------------------------------
  describe('encryption enabled', () => {
    let svc: FieldEncryptionService;

    beforeEach(() => {
      configureMocks();
      svc = new FieldEncryptionService({
        kmsKeyId: 'arn:aws:kms:us-east-1:000000000000:key/test-key',
        region: 'us-east-1',
      });
    });

    it('enabled should be true', () => {
      expect(svc.enabled).toBe(true);
    });

    it('encryptField produces a valid JSON envelope', async () => {
      const encrypted = await svc.encryptField('Hello World');
      const envelope: EncryptedEnvelope = JSON.parse(encrypted);

      expect(envelope.v).toBe(1);
      expect(typeof envelope.dek).toBe('string');
      expect(typeof envelope.iv).toBe('string');
      expect(typeof envelope.tag).toBe('string');
      expect(typeof envelope.ct).toBe('string');
    });

    it('encryptField followed by decryptField returns original value', async () => {
      const original = 'Sensitive PII Data 🔒';
      const encrypted = await svc.encryptField(original);
      expect(encrypted).not.toBe(original);

      const decrypted = await svc.decryptField(encrypted);
      expect(decrypted).toBe(original);
    });

    it('encrypts and decrypts empty string', async () => {
      const encrypted = await svc.encryptField('');
      const decrypted = await svc.decryptField(encrypted);
      expect(decrypted).toBe('');
    });

    it('encrypts and decrypts long text', async () => {
      const long = 'A'.repeat(10_000);
      const encrypted = await svc.encryptField(long);
      const decrypted = await svc.decryptField(encrypted);
      expect(decrypted).toBe(long);
    });

    it('encrypts and decrypts unicode text', async () => {
      const unicode = '日本語テスト 🇯🇵 Ñoño 中文';
      const encrypted = await svc.encryptField(unicode);
      const decrypted = await svc.decryptField(encrypted);
      expect(decrypted).toBe(unicode);
    });

    it('produces different ciphertext for the same input (unique IV)', async () => {
      const value = 'same value';
      const a = await svc.encryptField(value);
      const b = await svc.encryptField(value);
      expect(a).not.toBe(b);

      // But both decrypt to the same value
      expect(await svc.decryptField(a)).toBe(value);
      expect(await svc.decryptField(b)).toBe(value);
    });

    it('decryptField returns non-envelope strings as-is', async () => {
      expect(await svc.decryptField('plain text')).toBe('plain text');
      expect(await svc.decryptField('{"v":2}')).toBe('{"v":2}');
      expect(await svc.decryptField('')).toBe('');
    });
  });

  // -----------------------------------------------------------------------
  // encryptFields / decryptFields (record-level)
  // -----------------------------------------------------------------------
  describe('record-level encrypt/decrypt', () => {
    let svc: FieldEncryptionService;

    beforeEach(() => {
      configureMocks();
      svc = new FieldEncryptionService({
        kmsKeyId: 'arn:aws:kms:us-east-1:000000000000:key/test-key',
      });
    });

    it('encrypts only specified string fields', async () => {
      const record = {
        full_name: 'Alice',
        bio: 'Hello',
        followers: 1000,
        profile_pic_url: null as string | null,
      };

      const encrypted = await svc.encryptFields(record, [
        'full_name',
        'bio',
        'profile_pic_url',
      ]);

      // String fields should be encrypted envelopes
      expect(encrypted.full_name).not.toBe('Alice');
      expect(JSON.parse(encrypted.full_name as string).v).toBe(1);

      expect(encrypted.bio).not.toBe('Hello');
      expect(JSON.parse(encrypted.bio as string).v).toBe(1);

      // Numeric field untouched
      expect(encrypted.followers).toBe(1000);

      // Null field untouched
      expect(encrypted.profile_pic_url).toBeNull();
    });

    it('decrypts only specified string fields', async () => {
      const original = {
        full_name: 'Alice',
        bio: 'Hello',
        followers: 1000,
        profile_pic_url: null as string | null,
      };

      const encrypted = await svc.encryptFields(original, [
        'full_name',
        'bio',
        'profile_pic_url',
      ]);

      const decrypted = await svc.decryptFields(encrypted, [
        'full_name',
        'bio',
        'profile_pic_url',
      ]);

      expect(decrypted.full_name).toBe('Alice');
      expect(decrypted.bio).toBe('Hello');
      expect(decrypted.followers).toBe(1000);
      expect(decrypted.profile_pic_url).toBeNull();
    });

    it('does not mutate the original record', async () => {
      const original = { full_name: 'Alice', bio: 'Hello' };
      const copy = { ...original };

      await svc.encryptFields(original, ['full_name', 'bio']);

      // Original object should not be modified
      expect(original).toEqual(copy);
    });
  });

  // -----------------------------------------------------------------------
  // Error handling
  // -----------------------------------------------------------------------
  describe('error handling', () => {
    it('throws when KMS GenerateDataKey returns empty plaintext', async () => {
      mockSend.mockResolvedValue({ Plaintext: null, CiphertextBlob: null });

      const svc = new FieldEncryptionService({
        kmsKeyId: 'arn:aws:kms:us-east-1:000000000000:key/test-key',
      });

      await expect(svc.encryptField('hello')).rejects.toThrow(
        'KMS GenerateDataKey returned empty key material',
      );
    });

    it('throws when KMS Decrypt returns empty plaintext', async () => {
      // First call (GenerateDataKey) succeeds
      configureMocks();
      const svc = new FieldEncryptionService({
        kmsKeyId: 'arn:aws:kms:us-east-1:000000000000:key/test-key',
      });

      const encrypted = await svc.encryptField('hello');

      // Now make Decrypt fail
      mockSend.mockResolvedValue({ Plaintext: null });

      await expect(svc.decryptField(encrypted)).rejects.toThrow(
        'KMS Decrypt returned empty plaintext',
      );
    });

    it('throws when KMS call fails', async () => {
      mockSend.mockRejectedValue(new Error('KMS unavailable'));

      const svc = new FieldEncryptionService({
        kmsKeyId: 'arn:aws:kms:us-east-1:000000000000:key/test-key',
      });

      await expect(svc.encryptField('hello')).rejects.toThrow(
        'KMS unavailable',
      );
    });
  });

  // -----------------------------------------------------------------------
  // AES-256-GCM low-level helpers
  // -----------------------------------------------------------------------
  describe('AES-256-GCM helpers', () => {
    it('aesEncrypt / aesDecrypt round-trip', () => {
      const key = randomBytes(32);
      const plaintext = 'Secret data';

      const { iv, tag, ciphertext } = aesEncrypt(plaintext, key);
      const result = aesDecrypt(ciphertext, key, iv, tag);

      expect(result).toBe(plaintext);
    });

    it('tampered ciphertext throws authentication error', () => {
      const key = randomBytes(32);
      const { iv, tag, ciphertext } = aesEncrypt('data', key);

      // Flip a byte
      ciphertext[0] ^= 0xff;

      expect(() => aesDecrypt(ciphertext, key, iv, tag)).toThrow();
    });

    it('tampered tag throws authentication error', () => {
      const key = randomBytes(32);
      const { iv, tag, ciphertext } = aesEncrypt('data', key);

      tag[0] ^= 0xff;

      expect(() => aesDecrypt(ciphertext, key, iv, tag)).toThrow();
    });

    it('wrong key throws error', () => {
      const key1 = randomBytes(32);
      const key2 = randomBytes(32);
      const { iv, tag, ciphertext } = aesEncrypt('data', key1);

      expect(() => aesDecrypt(ciphertext, key2, iv, tag)).toThrow();
    });
  });

  // -----------------------------------------------------------------------
  // Singleton
  // -----------------------------------------------------------------------
  describe('singleton management', () => {
    const origEnv = process.env.FIELD_ENCRYPTION_KMS_KEY_ID;

    afterEach(() => {
      resetFieldEncryptionService();
      if (origEnv === undefined) {
        delete process.env.FIELD_ENCRYPTION_KMS_KEY_ID;
      } else {
        process.env.FIELD_ENCRYPTION_KMS_KEY_ID = origEnv;
      }
    });

    it('getFieldEncryptionService returns a singleton', () => {
      const a = getFieldEncryptionService();
      const b = getFieldEncryptionService();
      expect(a).toBe(b);
    });

    it('resetFieldEncryptionService clears the singleton', () => {
      const a = getFieldEncryptionService();
      resetFieldEncryptionService();
      const b = getFieldEncryptionService();
      expect(a).not.toBe(b);
    });

    it('reads FIELD_ENCRYPTION_KMS_KEY_ID from env', () => {
      process.env.FIELD_ENCRYPTION_KMS_KEY_ID =
        'arn:aws:kms:us-east-1:000000000000:key/env-test';
      resetFieldEncryptionService();

      const svc = getFieldEncryptionService();
      expect(svc.enabled).toBe(true);
    });

    it('disabled when env var is not set', () => {
      delete process.env.FIELD_ENCRYPTION_KMS_KEY_ID;
      resetFieldEncryptionService();

      const svc = getFieldEncryptionService();
      expect(svc.enabled).toBe(false);
    });
  });
});
