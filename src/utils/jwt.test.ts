import crypto from 'node:crypto';
import { verifySupabaseJwt } from '../../src/utils/jwt';

const SECRET = 'test-jwt-secret-at-least-32-characters-long';

function b64url(input: Buffer | string): string {
  return Buffer.from(input)
    .toString('base64')
    .replace(/=+$/u, '')
    .replace(/\+/g, '-')
    .replace(/\//g, '_');
}

function signJwt(
  payload: Record<string, unknown>,
  secret = SECRET,
  header: Record<string, unknown> = { alg: 'HS256', typ: 'JWT' },
): string {
  const h = b64url(JSON.stringify(header));
  const p = b64url(JSON.stringify(payload));
  const sig = b64url(crypto.createHmac('sha256', secret).update(`${h}.${p}`).digest());
  return `${h}.${p}.${sig}`;
}

describe('verifySupabaseJwt', () => {
  const now = Math.floor(Date.now() / 1000);

  it('verifies a valid HS256 token', () => {
    const token = signJwt({ sub: 'u1', exp: now + 60, email: 'a@b.c' });
    const p = verifySupabaseJwt(token, SECRET);
    expect(p.sub).toBe('u1');
    expect(p.email).toBe('a@b.c');
  });

  it('rejects a malformed token', () => {
    expect(() => verifySupabaseJwt('abc.def', SECRET)).toThrow();
  });

  it('rejects an unsupported algorithm (none)', () => {
    const h = b64url(JSON.stringify({ alg: 'none', typ: 'JWT' }));
    const p = b64url(JSON.stringify({ sub: 'u1' }));
    expect(() => verifySupabaseJwt(`${h}.${p}.`, SECRET)).toThrow();
  });

  it('rejects a bad signature', () => {
    const token = signJwt({ sub: 'u1', exp: now + 60 }, 'other-secret');
    expect(() => verifySupabaseJwt(token, SECRET)).toThrow();
  });

  it('rejects expired tokens', () => {
    const token = signJwt({ sub: 'u1', exp: now - 5 });
    expect(() => verifySupabaseJwt(token, SECRET)).toThrow(/expired/i);
  });

  it('rejects tokens with missing subject', () => {
    const token = signJwt({ exp: now + 60 });
    expect(() => verifySupabaseJwt(token, SECRET)).toThrow(/subject/i);
  });

  it('rejects an empty token string', () => {
    expect(() => verifySupabaseJwt('', SECRET)).toThrow();
  });
});
