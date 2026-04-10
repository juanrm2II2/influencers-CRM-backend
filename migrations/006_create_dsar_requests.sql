-- Migration: Create dsar_requests table for tracking Data Subject Access Requests.
--
-- Run this migration against your Supabase (PostgreSQL) database.

CREATE TABLE IF NOT EXISTS dsar_requests (
  id           UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id      TEXT        NOT NULL,
  user_email   TEXT,
  request_type TEXT        NOT NULL,  -- 'access', 'erasure', 'export'
  status       TEXT        NOT NULL DEFAULT 'pending',  -- 'pending', 'processing', 'completed', 'rejected'
  notes        TEXT,
  completed_at TIMESTAMPTZ,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_dsar_user    ON dsar_requests (user_id);
CREATE INDEX IF NOT EXISTS idx_dsar_status  ON dsar_requests (status);
CREATE INDEX IF NOT EXISTS idx_dsar_created ON dsar_requests (created_at);
