-- Migration: Create outreach table for tracking influencer communications.
--
-- Run this migration against your Supabase (PostgreSQL) database.

CREATE TABLE IF NOT EXISTS outreach (
  id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  influencer_id   UUID        NOT NULL REFERENCES influencers (id) ON DELETE CASCADE,
  contact_date    TIMESTAMPTZ,
  channel         TEXT,
  message_sent    TEXT,
  response        TEXT,
  follow_up_date  TIMESTAMPTZ,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_outreach_influencer ON outreach (influencer_id);
CREATE INDEX IF NOT EXISTS idx_outreach_contact    ON outreach (contact_date);
