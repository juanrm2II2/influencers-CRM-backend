import { Request, Response, NextFunction } from 'express';
import jwt, { JwtPayload } from 'jsonwebtoken';
import { tokenBlocklist } from '../services/tokenBlocklist';

const JWT_SECRET = process.env.SUPABASE_JWT_SECRET;

/**
 * Middleware that validates a Supabase-issued JWT from the Authorization header.
 *
 * Expects: `Authorization: Bearer <token>`
 *
 * On success the decoded payload is attached to `req.user`.
 * Also checks the persistent token blocklist for revoked tokens.
 */
export async function authenticate(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    res.status(401).json({ error: 'Missing or malformed Authorization header' });
    return;
  }

  const token = authHeader.slice(7); // strip "Bearer "

  if (!JWT_SECRET) {
    res.status(500).json({ error: 'Authentication is not configured' });
    return;
  }

  try {
    const decoded = jwt.verify(token, JWT_SECRET, {
      algorithms: ['HS256'],
    }) as JwtPayload & { sub: string; email?: string; role?: string; jti?: string };

    // Check persistent token blocklist for revoked tokens
    const tokenId = decoded.jti ?? token;
    if (await tokenBlocklist.isRevoked(tokenId)) {
      res.status(401).json({ error: 'Token has been revoked' });
      return;
    }

    req.user = decoded;
    next();
  } catch {
    res.status(401).json({ error: 'Invalid or expired token' });
  }
}
