-- Migration 008: Tenant isolation for influencers / outreach.
--
-- Adds a `user_id` (owner) column to the core CRM tables and enables
-- PostgreSQL Row-Level Security so each authenticated user can only access
-- the rows they own (`auth.uid()`).
--
-- This migration addresses audit findings H1 (RLS bypass — service-role
-- client used for every user-facing query) and H2 (no tenant/ownership
-- column on core data tables).
--
-- IMPORTANT  Run this migration during a maintenance window.  Existing
-- rows must be back-filled with a valid owner before the NOT NULL
-- constraint is enforced — choose one of:
--   1. Set every existing row to the project owner's auth.uid(): adjust
--      the UPDATE statements below.
--   2. Truncate the tables before running the migration (dev / staging only).

-- ---------------------------------------------------------------------------
-- influencers
-- ---------------------------------------------------------------------------

ALTER TABLE influencers
  ADD COLUMN IF NOT EXISTS user_id UUID REFERENCES auth.users (id) ON DELETE CASCADE;

-- Backfill: replace `<OWNER_UID>` with the auth.uid() that should own existing
-- rows, or remove these statements after manual back-fill.
-- UPDATE influencers SET user_id = '<OWNER_UID>'::uuid WHERE user_id IS NULL;

-- Once back-filled, enforce NOT NULL.  Postpone this statement until after
-- back-fill in production.
ALTER TABLE influencers
  ALTER COLUMN user_id SET NOT NULL;

-- Replace the global UNIQUE(handle, platform) with a per-tenant uniqueness
-- constraint so two different users can each store the same handle.
ALTER TABLE influencers
  DROP CONSTRAINT IF EXISTS influencers_handle_platform_key;

ALTER TABLE influencers
  ADD CONSTRAINT influencers_handle_platform_user_key
  UNIQUE (handle, platform, user_id);

CREATE INDEX IF NOT EXISTS idx_influencers_user_id ON influencers (user_id);

-- Enable Row-Level Security
ALTER TABLE influencers ENABLE ROW LEVEL SECURITY;
ALTER TABLE influencers FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS influencers_select_own ON influencers;
CREATE POLICY influencers_select_own ON influencers
  FOR SELECT USING (user_id = auth.uid());

DROP POLICY IF EXISTS influencers_insert_own ON influencers;
CREATE POLICY influencers_insert_own ON influencers
  FOR INSERT WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS influencers_update_own ON influencers;
CREATE POLICY influencers_update_own ON influencers
  FOR UPDATE USING (user_id = auth.uid())
              WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS influencers_delete_own ON influencers;
CREATE POLICY influencers_delete_own ON influencers
  FOR DELETE USING (user_id = auth.uid());

-- ---------------------------------------------------------------------------
-- outreach
-- ---------------------------------------------------------------------------

ALTER TABLE outreach
  ADD COLUMN IF NOT EXISTS user_id UUID REFERENCES auth.users (id) ON DELETE CASCADE;

-- Backfill from the parent influencer's owner
UPDATE outreach o
   SET user_id = i.user_id
  FROM influencers i
 WHERE o.influencer_id = i.id
   AND o.user_id IS NULL;

ALTER TABLE outreach
  ALTER COLUMN user_id SET NOT NULL;

CREATE INDEX IF NOT EXISTS idx_outreach_user_id ON outreach (user_id);

ALTER TABLE outreach ENABLE ROW LEVEL SECURITY;
ALTER TABLE outreach FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS outreach_select_own ON outreach;
CREATE POLICY outreach_select_own ON outreach
  FOR SELECT USING (user_id = auth.uid());

DROP POLICY IF EXISTS outreach_insert_own ON outreach;
CREATE POLICY outreach_insert_own ON outreach
  FOR INSERT WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS outreach_update_own ON outreach;
CREATE POLICY outreach_update_own ON outreach
  FOR UPDATE USING (user_id = auth.uid())
              WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS outreach_delete_own ON outreach;
CREATE POLICY outreach_delete_own ON outreach
  FOR DELETE USING (user_id = auth.uid());

-- ---------------------------------------------------------------------------
-- consent / dsar_requests / audit_log — RLS for existing user-scoped tables
-- ---------------------------------------------------------------------------

ALTER TABLE consent ENABLE ROW LEVEL SECURITY;
ALTER TABLE consent FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS consent_rw_own ON consent;
CREATE POLICY consent_rw_own ON consent
  FOR ALL USING (user_id = auth.uid()::text)
          WITH CHECK (user_id = auth.uid()::text);

ALTER TABLE dsar_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE dsar_requests FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS dsar_select_own ON dsar_requests;
CREATE POLICY dsar_select_own ON dsar_requests
  FOR SELECT USING (user_id = auth.uid()::text);

DROP POLICY IF EXISTS dsar_insert_own ON dsar_requests;
CREATE POLICY dsar_insert_own ON dsar_requests
  FOR INSERT WITH CHECK (user_id = auth.uid()::text);

-- DSAR status updates and purges remain admin-only via the service-role key.
