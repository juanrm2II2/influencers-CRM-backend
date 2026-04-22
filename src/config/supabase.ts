import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { env } from './env';

/**
 * Supabase clients.
 *
 * - `anonClient`: uses the public anon key. Use when you want RLS enforced
 *   against the anonymous role (rare on the server).
 * - `serviceClient`: uses the service-role key which BYPASSES RLS. Only use
 *   inside server-side code paths that have already enforced their own
 *   authorization (e.g. after RBAC middleware).
 * - `userClient(accessToken)`: returns a client that forwards the user's
 *   access token so RLS policies evaluate against that user's JWT.
 *
 * Never ship the service-role key to browsers.
 */

let _anon: SupabaseClient | undefined;
let _service: SupabaseClient | undefined;

export function anonClient(): SupabaseClient {
  if (!_anon) {
    _anon = createClient(env().SUPABASE_URL, env().SUPABASE_ANON_KEY, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
  }
  return _anon;
}

export function serviceClient(): SupabaseClient {
  if (!_service) {
    _service = createClient(env().SUPABASE_URL, env().SUPABASE_SERVICE_ROLE_KEY, {
      auth: { persistSession: false, autoRefreshToken: false },
      global: { headers: { 'X-Client-Info': 'influencers-crm-backend/service' } },
    });
  }
  return _service;
}

export function userClient(accessToken: string): SupabaseClient {
  return createClient(env().SUPABASE_URL, env().SUPABASE_ANON_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { headers: { Authorization: `Bearer ${accessToken}` } },
  });
}

/** For tests: reset cached singletons. */
export function resetSupabaseClientsForTesting(): void {
  _anon = undefined;
  _service = undefined;
}
