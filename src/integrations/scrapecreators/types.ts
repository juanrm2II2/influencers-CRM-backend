export type Platform = 'tiktok' | 'instagram' | 'youtube' | 'twitter';

/**
 * Canonical influencer profile returned to the domain layer. The raw
 * ScrapeCreators shape (which differs per platform) is mapped to this
 * single type in the client, so nothing outside the integration layer
 * depends on vendor field names.
 */
export interface InfluencerProfile {
  platform: Platform;
  handle: string;
  displayName: string | null;
  avatarUrl: string | null;
  bio: string | null;
  verified: boolean;
  country: string | null;
  language: string | null;
  followers: number;
  following: number | null;
  posts: number | null;
  engagementRate: number | null; // 0..1
  avgViews: number | null;
  fetchedAt: string; // ISO 8601
  /** Arbitrary extra vendor data, may be stored but never relied upon typed. */
  raw: Record<string, unknown>;
}
