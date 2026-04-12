-- KYC verifications table
-- Tracks KYC verification status per user via a third-party provider (Sumsub).

CREATE TABLE IF NOT EXISTS kyc_verifications (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       TEXT NOT NULL UNIQUE,
  kyc_status    TEXT NOT NULL DEFAULT 'pending'
                CHECK (kyc_status IN ('pending', 'verified', 'rejected')),
  provider      TEXT NOT NULL DEFAULT 'sumsub',
  applicant_id  TEXT,                              -- provider-side applicant ID
  review_answer TEXT,                              -- provider review answer (e.g. GREEN / RED)
  rejection_reason TEXT,                           -- human-readable rejection reason
  verified_at   TIMESTAMPTZ,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Index for fast lookups by user
CREATE INDEX IF NOT EXISTS idx_kyc_verifications_user_id ON kyc_verifications (user_id);
-- Index for admin queries filtering by status
CREATE INDEX IF NOT EXISTS idx_kyc_verifications_status ON kyc_verifications (kyc_status);
