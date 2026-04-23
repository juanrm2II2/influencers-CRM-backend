import crypto from 'node:crypto';

/**
 * AES-256-GCM application-layer encryption for PII (KYC) fields.
 *
 * Output format: base64("v1" || iv(12) || tag(16) || ciphertext)
 * The "v1" prefix allows key/version rotation without schema changes.
 */
const VERSION = Buffer.from('v1');
const IV_LEN = 12;
const TAG_LEN = 16;

function keyBuffer(hexKey: string): Buffer {
  if (!/^[0-9a-fA-F]{64}$/.test(hexKey)) {
    throw new Error('Encryption key must be 32 bytes hex (64 chars)');
  }
  return Buffer.from(hexKey, 'hex');
}

export function encryptString(plaintext: string, hexKey: string): string {
  const key = keyBuffer(hexKey);
  const iv = crypto.randomBytes(IV_LEN);
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
  const ct = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return Buffer.concat([VERSION, iv, tag, ct]).toString('base64');
}

export function decryptString(payload: string, hexKey: string): string {
  const key = keyBuffer(hexKey);
  const buf = Buffer.from(payload, 'base64');
  if (buf.length < VERSION.length + IV_LEN + TAG_LEN + 1) {
    throw new Error('Ciphertext too short');
  }
  const version = buf.subarray(0, VERSION.length);
  if (!version.equals(VERSION)) {
    throw new Error(`Unsupported ciphertext version: ${version.toString()}`);
  }
  const iv = buf.subarray(VERSION.length, VERSION.length + IV_LEN);
  const tag = buf.subarray(VERSION.length + IV_LEN, VERSION.length + IV_LEN + TAG_LEN);
  const ct = buf.subarray(VERSION.length + IV_LEN + TAG_LEN);
  const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv);
  decipher.setAuthTag(tag);
  const pt = Buffer.concat([decipher.update(ct), decipher.final()]);
  return pt.toString('utf8');
}
