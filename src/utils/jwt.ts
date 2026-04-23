import crypto from 'node:crypto';
import { UnauthorizedError } from '../utils/errors';

/**
 * Minimal HS256 JWT verifier. Supabase Auth issues HS256 tokens signed with
 * the project's JWT secret by default. We avoid pulling in a full JWT library
 * to keep the trusted surface small and the dependency tree auditable.
 *
 * This verifier:
 *   - Enforces `alg: HS256` (rejects `none` and asymmetric algorithms).
 *   - Validates the signature in constant time.
 *   - Validates `exp` and `nbf` when present.
 *   - Returns the decoded payload typed as SupabaseJwtPayload.
 *
 * It does NOT attempt to mirror every option of the jsonwebtoken library —
 * only what Supabase needs.
 */
export interface SupabaseJwtPayload {
  sub: string; // user id
  email?: string;
  role?: string; // usually "authenticated"
  aud?: string | string[];
  iss?: string;
  exp?: number;
  nbf?: number;
  iat?: number;
  app_metadata?: Record<string, unknown>;
  user_metadata?: Record<string, unknown>;
}

function base64UrlDecode(s: string): Buffer {
  const pad = s.length % 4 === 0 ? '' : '='.repeat(4 - (s.length % 4));
  return Buffer.from(s.replace(/-/g, '+').replace(/_/g, '/') + pad, 'base64');
}

export function verifySupabaseJwt(token: string, secret: string): SupabaseJwtPayload {
  if (typeof token !== 'string' || token.length === 0) {
    throw new UnauthorizedError('Missing token');
  }
  const parts = token.split('.');
  if (parts.length !== 3) {
    throw new UnauthorizedError('Malformed token');
  }
  const [headerB64, payloadB64, sigB64] = parts;

  let header: { alg?: string; typ?: string };
  let payload: SupabaseJwtPayload & Record<string, unknown>;
  try {
    header = JSON.parse(base64UrlDecode(headerB64).toString('utf8'));
    payload = JSON.parse(base64UrlDecode(payloadB64).toString('utf8'));
  } catch {
    throw new UnauthorizedError('Malformed token');
  }

  if (header.alg !== 'HS256') {
    throw new UnauthorizedError('Unsupported token algorithm');
  }

  const signingInput = `${headerB64}.${payloadB64}`;
  const expected = crypto.createHmac('sha256', secret).update(signingInput).digest();
  const provided = base64UrlDecode(sigB64);

  if (expected.length !== provided.length || !crypto.timingSafeEqual(expected, provided)) {
    throw new UnauthorizedError('Invalid token signature');
  }

  const now = Math.floor(Date.now() / 1000);
  if (typeof payload.exp === 'number' && now >= payload.exp) {
    throw new UnauthorizedError('Token expired');
  }
  if (typeof payload.nbf === 'number' && now < payload.nbf) {
    throw new UnauthorizedError('Token not yet valid');
  }
  if (typeof payload.sub !== 'string' || payload.sub.length === 0) {
    throw new UnauthorizedError('Token missing subject');
  }

  return payload;
}
