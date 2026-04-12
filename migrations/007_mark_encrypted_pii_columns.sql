-- Migration: widen PII columns for encrypted storage
--
-- Column-level encryption stores ciphertext as a JSON envelope string.
-- The columns are already TEXT, but this migration documents the intent
-- and can be used to add a comment marking them as encrypted.

-- Mark encrypted PII columns with comments for documentation
COMMENT ON COLUMN influencers.full_name     IS 'PII – encrypted at rest via AES-256-GCM envelope encryption (AWS KMS)';
COMMENT ON COLUMN influencers.bio           IS 'PII – encrypted at rest via AES-256-GCM envelope encryption (AWS KMS)';
COMMENT ON COLUMN influencers.profile_pic_url IS 'PII – encrypted at rest via AES-256-GCM envelope encryption (AWS KMS)';
COMMENT ON COLUMN influencers.profile_url   IS 'PII – encrypted at rest via AES-256-GCM envelope encryption (AWS KMS)';
