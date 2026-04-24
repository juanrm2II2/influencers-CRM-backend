import { createClient, SupabaseClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_KEY;
const supabaseAnonKey = process.env.SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseServiceKey) {
  throw new Error('Missing SUPABASE_URL or SUPABASE_SERVICE_KEY environment variables');
}

if (!supabaseAnonKey) {
  throw new Error('Missing SUPABASE_ANON_KEY environment variable (required for RLS-aware scoped client)');
}

/**
 * Service-role Supabase client.
 *
 * **WARNING — bypasses Row-Level Security.**  Use *only* for admin / system
 * operations: audit-log writes, token-blocklist writes, GDPR DSAR completion,
 * scheduled retention purge, and one-off migration scripts.
 *
 * Never use this client to fulfil a user-originated request — use
 * {@link createScopedClient} instead so PostgreSQL RLS enforces tenant
 * isolation by `auth.uid()`.
 */
export const supabase: SupabaseClient = createClient(supabaseUrl, supabaseServiceKey, {
  auth: { persistSession: false, autoRefreshToken: false },
});

/**
 * Build a per-request Supabase client whose queries are subject to PostgreSQL
 * Row-Level Security policies.
 *
 * The client is constructed with the anon (public) API key plus the caller's
 * JWT in the `Authorization` header.  Inside Postgres, `auth.uid()` resolves
 * to the authenticated user, so RLS policies keyed on `user_id = auth.uid()`
 * provide tenant isolation even when the application logic forgets to filter.
 *
 * Call from `authenticate` middleware and attach to `req.scopedClient`.
 */
export function createScopedClient(accessToken: string): SupabaseClient {
  if (!accessToken || typeof accessToken !== 'string') {
    throw new Error('createScopedClient requires a non-empty access token');
  }
  return createClient(supabaseUrl as string, supabaseAnonKey as string, {
    global: {
      headers: { Authorization: `Bearer ${accessToken}` },
    },
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  });
}
