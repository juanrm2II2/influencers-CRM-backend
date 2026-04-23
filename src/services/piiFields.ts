/**
 * PII field configuration for the influencers table.
 *
 * Lists the column names that contain Personally Identifiable
 * Information and should be encrypted at rest using the
 * {@link FieldEncryptionService}.
 *
 * Only string fields are encrypted.  Numeric fields (followers,
 * avg_likes, etc.) are left in plaintext so that database-level
 * filtering and ordering remain functional.
 *
 * @module piiFields
 */

/**
 * Influencer columns classified as PII.
 *
 * These fields store information that can directly or indirectly
 * identify a natural person and therefore must be protected under
 * GDPR / CCPA / similar regulations.
 */
export const INFLUENCER_PII_FIELDS = [
  'full_name',
  'bio',
  'profile_pic_url',
  'profile_url',
] as const;

export type InfluencerPiiField = (typeof INFLUENCER_PII_FIELDS)[number];
