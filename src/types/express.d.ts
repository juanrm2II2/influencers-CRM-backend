import { JwtPayload } from 'jsonwebtoken';

declare global {
  namespace Express {
    interface Request {
      /** Authenticated user payload, set by the auth middleware. */
      user?: JwtPayload & {
        sub: string;
        email?: string;
        role?: string;
      };
    }
  }
}
