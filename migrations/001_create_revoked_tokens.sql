-- Migration: Create revoked_tokens table for persistent JWT token revocation.
--
-- This table replaces the previous in-memory Map-based blocklist so that
-- revoked tokens remain invalid across server restarts.
--
-- Run this migration against your Supabase (PostgreSQL) database before
-- deploying the updated application.

CREATE TABLE IF NOT EXISTS revoked_tokens (
  token      TEXT        PRIMARY KEY,
  expires_at TIMESTAMPTZ NOT NULL,
  revoked_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Index to speed up the periodic cleanup of expired entries.
CREATE INDEX IF NOT EXISTS idx_revoked_tokens_expires_at
  ON revoked_tokens (expires_at);
