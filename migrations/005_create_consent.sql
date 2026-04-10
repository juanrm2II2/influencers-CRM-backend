-- Migration: Create consent table for GDPR consent management.
--
-- Run this migration against your Supabase (PostgreSQL) database.

CREATE TABLE IF NOT EXISTS consent (
  id           UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id      TEXT        NOT NULL,
  consent_type TEXT        NOT NULL,
  granted      BOOLEAN     NOT NULL DEFAULT false,
  ip_address   TEXT,
  granted_at   TIMESTAMPTZ,
  revoked_at   TIMESTAMPTZ,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT now(),

  UNIQUE (user_id, consent_type)
);

CREATE INDEX IF NOT EXISTS idx_consent_user ON consent (user_id);
CREATE INDEX IF NOT EXISTS idx_consent_type ON consent (consent_type);
