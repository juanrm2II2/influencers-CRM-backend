import type { InfluencerProfile, Platform } from './types';

/**
 * Map vendor responses to our canonical {@link InfluencerProfile} shape.
 *
 * ScrapeCreators exposes different fields per platform. We accept the raw
 * response as `unknown`/`Record<string, unknown>` and extract fields
 * defensively so a change in vendor shape produces nulls rather than
 * thrown errors in the hot path. The raw payload is preserved for debug
 * and re-mapping without re-fetching.
 */
export function mapProfile(
  platform: Platform,
  handle: string,
  raw: Record<string, unknown>,
): InfluencerProfile {
  const pick = (...keys: string[]): unknown => {
    for (const key of keys) {
      const v = getPath(raw, key);
      if (v !== undefined && v !== null) return v;
    }
    return undefined;
  };

  const num = (v: unknown): number | null => {
    if (typeof v === 'number' && Number.isFinite(v)) return v;
    if (typeof v === 'string' && v.trim() !== '' && Number.isFinite(Number(v))) {
      return Number(v);
    }
    return null;
  };
  const str = (v: unknown): string | null => (typeof v === 'string' && v.length > 0 ? v : null);
  const bool = (v: unknown): boolean => v === true || v === 'true' || v === 1;

  const followers =
    num(pick('followers', 'follower_count', 'followers_count', 'subscriberCount', 'subscribers')) ??
    0;

  return {
    platform,
    handle,
    displayName: str(pick('displayName', 'display_name', 'name', 'fullName', 'full_name', 'title')),
    avatarUrl: str(pick('avatarUrl', 'avatar', 'avatar_url', 'profilePicUrl', 'thumbnail')),
    bio: str(pick('bio', 'biography', 'description')),
    verified: bool(pick('verified', 'is_verified', 'isVerified')),
    country: str(pick('country', 'country_code')),
    language: str(pick('language', 'lang')),
    followers,
    following: num(pick('following', 'following_count', 'follows_count')),
    posts: num(pick('posts', 'media_count', 'post_count', 'videoCount', 'videos')),
    engagementRate: num(pick('engagementRate', 'engagement_rate')),
    avgViews: num(pick('avgViews', 'avg_views', 'average_views', 'viewCount')),
    fetchedAt: new Date().toISOString(),
    raw,
  };
}

function getPath(obj: Record<string, unknown>, key: string): unknown {
  // Supports dotted keys ("data.user.followers") for nested vendor responses.
  if (!key.includes('.')) return obj[key];
  return key.split('.').reduce<unknown>((acc, part) => {
    if (acc && typeof acc === 'object' && part in (acc as Record<string, unknown>)) {
      return (acc as Record<string, unknown>)[part];
    }
    return undefined;
  }, obj);
}
