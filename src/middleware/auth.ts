import { Request, Response, NextFunction } from 'express';
import jwt, {
  JwtPayload,
  Algorithm,
  Secret,
  GetPublicKeyOrSecret,
} from 'jsonwebtoken';
import { tokenBlocklist } from '../services/tokenBlocklist';
import { getJwtVerificationKey, getJwtAlgorithms } from '../services/keyProvider';
import { createScopedClient } from '../services/supabase';

/**
 * Matches a well-formed `Authorization: Bearer <token>` header value in a
 * case-insensitive manner (RFC 6750 §2.1 treats the scheme name as
 * case-insensitive).  The token itself must be non-empty.
 */
const BEARER_RE = /^Bearer[ \t]+(\S.*)$/i;

/**
 * Middleware that validates a Supabase-issued JWT from the Authorization header.
 *
 * Expects: `Authorization: Bearer <token>` (scheme match is case-insensitive).
 *
 * On success the decoded payload is attached to `req.user`.  Also checks the
 * persistent token blocklist for revoked tokens.
 *
 * A `jti` (JWT ID) claim is **required** — tokens without one are rejected.
 * This prevents the raw-token fallback that previously allowed an opaque
 * token string to be used as its own blocklist key (which leaks tokens into
 * persistent storage).
 *
 * The verification key and allowed algorithms are obtained from the
 * configured key provider (HS256 env/KMS/Secrets Manager, RS256 PEM, or
 * RS256 JWKS) via {@link getJwtVerificationKey} and {@link getJwtAlgorithms}.
 */
export async function authenticate(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  const authHeader = req.headers.authorization;

  const match = authHeader ? BEARER_RE.exec(authHeader) : null;
  if (!match) {
    res.status(401).json({ error: 'Missing or malformed Authorization header' });
    return;
  }
  const token = match[1].trim();

  let algorithms: Algorithm[];
  let verificationKey: Secret | GetPublicKeyOrSecret;
  try {
    algorithms = getJwtAlgorithms();
    verificationKey = await getJwtVerificationKey();
  } catch {
    res.status(500).json({ error: 'Authentication is not configured' });
    return;
  }

  let decoded: JwtPayload & { sub: string; email?: string; role?: string; jti?: string };
  try {
    decoded = await new Promise((resolve, reject) => {
      jwt.verify(
        token,
        verificationKey as Secret,
        { algorithms },
        (err, payload) => {
          if (err) return reject(err);
          resolve(payload as typeof decoded);
        }
      );
    });
  } catch {
    res.status(401).json({ error: 'Invalid or expired token' });
    return;
  }

  // Enforce jti presence — no raw-token fallback.
  if (!decoded.jti || typeof decoded.jti !== 'string') {
    res.status(401).json({ error: 'Invalid or expired token' });
    return;
  }

  try {
    if (await tokenBlocklist.isRevoked(decoded.jti)) {
      res.status(401).json({ error: 'Token has been revoked' });
      return;
    }
  } catch {
    // tokenBlocklist already fails closed internally; a thrown error here
    // means unexpected corruption — reject to be safe.
    res.status(401).json({ error: 'Invalid or expired token' });
    return;
  }

  req.user = decoded;
  req.accessToken = token;
  try {
    req.scopedClient = createScopedClient(token);
  } catch {
    // createScopedClient only throws on misconfiguration; surface as 500.
    res.status(500).json({ error: 'Authentication is not configured' });
    return;
  }
  next();
}
