-- Migration: Create audit_log table for recording all state-changing operations.
--
-- Run this migration against your Supabase (PostgreSQL) database.

CREATE TABLE IF NOT EXISTS audit_log (
  id           UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  actor_id     TEXT        NOT NULL,
  actor_email  TEXT,
  action       TEXT        NOT NULL,
  resource     TEXT        NOT NULL,
  resource_id  TEXT,
  before_state JSONB,
  after_state  JSONB,
  ip_address   TEXT,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_audit_log_actor    ON audit_log (actor_id);
CREATE INDEX IF NOT EXISTS idx_audit_log_resource ON audit_log (resource, resource_id);
CREATE INDEX IF NOT EXISTS idx_audit_log_created  ON audit_log (created_at);
