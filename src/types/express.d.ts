import { JwtPayload } from 'jsonwebtoken';
import type { SupabaseClient } from '@supabase/supabase-js';

declare global {
  namespace Express {
    interface Request {
      /** Authenticated user payload, set by the auth middleware. */
      user?: JwtPayload & {
        sub: string;
        email?: string;
        role?: string;
      };
      /** Unique request correlation ID, set by the requestId middleware. */
      requestId?: string;
      /**
       * Per-request RLS-scoped Supabase client (anon key + caller JWT).
       * Set by the auth middleware.  Use this for every user-facing query;
       * use the service-role `supabase` client only for admin operations.
       */
      scopedClient?: SupabaseClient;
      /**
       * Raw Bearer access token extracted from the Authorization header,
       * set by the auth middleware.  Used to build per-request scoped
       * Supabase clients when the request body is mutated mid-pipeline.
       */
      accessToken?: string;
    }
  }
}
