-- Migration: Create influencers table for the core CRM data model.
--
-- Run this migration against your Supabase (PostgreSQL) database.

CREATE TABLE IF NOT EXISTS influencers (
  id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  handle          TEXT        NOT NULL,
  platform        TEXT        NOT NULL,
  full_name       TEXT,
  bio             TEXT,
  followers       INTEGER,
  following       INTEGER,
  avg_likes       NUMERIC,
  avg_views       NUMERIC,
  engagement_rate NUMERIC,
  profile_pic_url TEXT,
  profile_url     TEXT,
  niche           TEXT,
  status          TEXT        NOT NULL DEFAULT 'prospect',
  notes           TEXT,
  last_scraped    TIMESTAMPTZ,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),

  UNIQUE (handle, platform)
);

CREATE INDEX IF NOT EXISTS idx_influencers_platform ON influencers (platform);
CREATE INDEX IF NOT EXISTS idx_influencers_status   ON influencers (status);
