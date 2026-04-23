<<<<<<< HEAD
import type { NextFunction, Request, Response } from 'express';
import { env } from '../config/env';
import { ForbiddenError, UnauthorizedError } from '../utils/errors';
import { verifySupabaseJwt, type SupabaseJwtPayload } from '../utils/jwt';

/**
 * Canonical role identifiers. Keep in sync with `roles` table seed data.
 */
export const ROLES = {
  ADMIN: 'admin',
  MANAGER: 'manager',
  ANALYST: 'analyst',
  AUDITOR: 'auditor',
} as const;
export type Role = (typeof ROLES)[keyof typeof ROLES];

/** Authenticated principal attached to the request. */
export interface AuthPrincipal {
  userId: string;
  email?: string;
  roles: Role[];
  orgIds: string[];
  /** How the principal authenticated: user JWT or server-to-server API key. */
  source: 'jwt' | 'api-key';
  /** Raw access token, kept for creating a per-user Supabase client. */
  accessToken?: string;
}

export type AuthedRequest = Request & { auth: AuthPrincipal };

/**
 * Extracts a Bearer token from the Authorization header.
 * Returns null when absent — callers decide whether to require it.
 */
function extractBearer(req: Request): string | null {
  const h = req.header('authorization');
  if (!h) return null;
  const [scheme, token] = h.split(' ');
  if (scheme?.toLowerCase() !== 'bearer' || !token) return null;
  return token;
}

/**
 * Authentication middleware.
 *
 * Resolves one of:
 *   1. Bearer JWT issued by Supabase Auth  → `source: 'jwt'`
 *   2. `X-API-Key` header matching a hashed server-to-server key (verified
 *      in a downstream repository call — this middleware only extracts it).
 *
 * Role/org resolution is intentionally split into `loadPrincipalRoles` so
 * it can be replaced with a DB-backed implementation in later phases
 * without changing the middleware chain.
 */
export function authenticate(
  opts: {
    loadPrincipalRoles?: (userId: string) => Promise<{ roles: Role[]; orgIds: string[] }>;
    verifyApiKey?: (key: string) => Promise<AuthPrincipal | null>;
    required?: boolean;
  } = {},
) {
  const required = opts.required ?? true;
  return async (req: Request, _res: Response, next: NextFunction): Promise<void> => {
    try {
      // 1) API key path (server-to-server)
      const apiKey = req.header('x-api-key');
      if (apiKey && opts.verifyApiKey) {
        const principal = await opts.verifyApiKey(apiKey);
        if (!principal) throw new UnauthorizedError('Invalid API key');
        (req as AuthedRequest).auth = principal;
        return next();
      }

      // 2) JWT path
      const token = extractBearer(req);
      if (!token) {
        if (required) throw new UnauthorizedError('Authentication required');
        return next();
      }

      let payload: SupabaseJwtPayload;
      try {
        payload = verifySupabaseJwt(token, env().SUPABASE_JWT_SECRET);
      } catch (err) {
        // Re-throw as a 401 regardless of underlying reason.
        throw err instanceof UnauthorizedError ? err : new UnauthorizedError('Invalid token');
      }

      const { roles, orgIds } = opts.loadPrincipalRoles
        ? await opts.loadPrincipalRoles(payload.sub)
        : { roles: [], orgIds: [] };

      (req as AuthedRequest).auth = {
        userId: payload.sub,
        email: payload.email,
        roles,
        orgIds,
        source: 'jwt',
        accessToken: token,
      };
      next();
    } catch (err) {
      next(err);
    }
  };
}

/**
 * Declarative RBAC guard. Requires the authenticated principal to have at
 * least one of the listed roles. Use after `authenticate()`.
 */
export function requireRole(...allowed: Role[]) {
  return (req: Request, _res: Response, next: NextFunction): void => {
    const principal = (req as AuthedRequest).auth;
    if (!principal) return next(new UnauthorizedError());
    const ok = principal.roles.some((r) => allowed.includes(r));
    if (!ok) return next(new ForbiddenError('Insufficient role'));
    next();
  };
}

/**
 * Require that the principal is a member of a specific organization. The
 * org id is taken from `req.params.orgId` by default but can be overridden.
 */
export function requireOrgMembership(opts: { paramName?: string } = {}) {
  const paramName = opts.paramName ?? 'orgId';
  return (req: Request, _res: Response, next: NextFunction): void => {
    const principal = (req as AuthedRequest).auth;
    if (!principal) return next(new UnauthorizedError());
    const orgId = req.params[paramName];
    if (!orgId) return next(new ForbiddenError('Organization context required'));
    if (!principal.orgIds.includes(orgId)) {
      return next(new ForbiddenError('Not a member of this organization'));
    }
    next();
  };
=======
import { Request, Response, NextFunction } from 'express';
import jwt, { JwtPayload } from 'jsonwebtoken';
import { tokenBlocklist } from '../services/tokenBlocklist';
import { getJwtSecret } from '../services/keyProvider';

/**
 * Middleware that validates a Supabase-issued JWT from the Authorization header.
 *
 * Expects: `Authorization: Bearer <token>`
 *
 * On success the decoded payload is attached to `req.user`.
 * Also checks the persistent token blocklist for revoked tokens.
 *
 * The signing secret is obtained from the configured key provider
 * (env var, AWS KMS, AWS Secrets Manager, …) via {@link getJwtSecret}.
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

  let secret: string;
  try {
    secret = await getJwtSecret();
  } catch {
    res.status(500).json({ error: 'Authentication is not configured' });
    return;
  }

  try {
    const decoded = jwt.verify(token, secret, {
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
>>>>>>> 17ef3c073da08a2589cd477774c945045b4ff8fd
}
