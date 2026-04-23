import { decryptString, encryptString } from '../../src/utils/crypto';

const KEY = '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef';

describe('crypto', () => {
  it('round-trips a string', () => {
    const ct = encryptString('hello world', KEY);
    expect(ct).not.toContain('hello');
    expect(decryptString(ct, KEY)).toBe('hello world');
  });

  it('produces different ciphertexts for the same plaintext (random IV)', () => {
    const a = encryptString('same', KEY);
    const b = encryptString('same', KEY);
    expect(a).not.toBe(b);
  });

  it('rejects a wrong key', () => {
    const ct = encryptString('secret', KEY);
    const wrong = 'f'.repeat(64);
    expect(() => decryptString(ct, wrong)).toThrow();
  });

  it('rejects tampered ciphertext (auth tag mismatch)', () => {
    const ct = encryptString('secret', KEY);
    const buf = Buffer.from(ct, 'base64');
    buf[buf.length - 1] ^= 0x01;
    expect(() => decryptString(buf.toString('base64'), KEY)).toThrow();
  });

  it('rejects a malformed key length', () => {
    expect(() => encryptString('hi', 'tooshort')).toThrow();
  });
});
