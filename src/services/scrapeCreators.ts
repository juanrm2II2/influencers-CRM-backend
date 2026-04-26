import axios from 'axios';
import { z } from 'zod/v4';
import { LRUCache } from 'lru-cache';
import { Platform, Influencer } from '../types';
import { logger } from '../logger';

const SCRAPECREATORS_API_KEY = process.env.SCRAPECREATORS_API_KEY;

if (!SCRAPECREATORS_API_KEY) {
  throw new Error('Missing SCRAPECREATORS_API_KEY environment variable');
}

/**
 * Short-lived response cache keyed on `<platform>:<handle>` (M1).
 *
 * Caps abusive bulk-search amplification by collapsing repeat lookups
 * within the TTL window into a single outbound API call, drastically
 * reducing both latency and paid-API quota usage.  TTL defaults to 10
 * minutes — short enough that profile metrics remain fresh, long enough
 * to absorb real-world bursts.
 */
const SCRAPER_CACHE_TTL_MS = Math.max(
  60_000,
  parseInt(process.env.SCRAPER_CACHE_TTL_MS ?? `${10 * 60_000}`, 10) || 10 * 60_000,
);
const SCRAPER_CACHE_MAX = 1_000;
const scraperCache = new LRUCache<string, Omit<Influencer, 'id' | 'user_id' | 'created_at'>>({
  max: SCRAPER_CACHE_MAX,
  ttl: SCRAPER_CACHE_TTL_MS,
});

/** Visible for tests so the cache can be cleared between runs. */
export function _clearScraperCache(): void {
  scraperCache.clear();
}

const scrapeClient = axios.create({
  headers: {
    'x-api-key': SCRAPECREATORS_API_KEY,
  },
  timeout: 30_000, // 30 seconds
});

/**
 * Request interceptor that blocks any outbound request whose URL does not
 * use the HTTPS protocol, preventing accidental plaintext data exposure
 * or SSRF downgrade attacks.
 */
scrapeClient.interceptors.request.use((config) => {
  const url = config.url ?? '';
  if (url && !url.startsWith('https://')) {
    throw new Error('Only HTTPS requests are allowed');
  }
  return config;
});

/**
 * Tight numeric schema for upstream-supplied counts.
 *
 * Rejects NaN / Infinity / negative / non-integer values and any value above
 * `1e10` (well beyond any plausible follower count).  Enforcing these bounds
 * up-front prevents a hostile or compromised upstream from poisoning the DB
 * with `Infinity`-derived `engagement_rate` values, breaking analytics, or
 * triggering pathological numeric behaviour in downstream consumers (M7).
 */
const Count = z
  .number()
  .int()
  .nonnegative()
  .finite()
  .max(1e10);

/**
 * Tight URL schema for upstream-supplied profile / avatar URLs.
 *
 * Rejects anything that isn't a syntactically valid HTTPS URL — preventing
 * `javascript:` / `data:` / `file:` URLs that could otherwise be rendered
 * verbatim by downstream UIs and lead to stored XSS or browser-side SSRF
 * (M8).  Failing values are stripped via `.optional().catch(undefined)` at
 * the field level so a single bad URL does not poison the entire response.
 */
const HttpsUrl = z
  .string()
  .url()
  .refine((u) => /^https:\/\//i.test(u), {
    message: 'URL must use the https:// scheme',
  });

/**
 * Zod schema for the ScrapeCreators API response profile object.
 * Validates the shape of the response and coerces/strips unexpected fields.
 */
const ScrapeCreatorsProfileSchema = z.object({
  username: z.optional(z.string()),
  nickname: z.optional(z.string()),
  uniqueId: z.optional(z.string()),
  name: z.optional(z.string()),
  full_name: z.optional(z.string()),
  biography: z.optional(z.string()),
  bio: z.optional(z.string()),
  signature: z.optional(z.string()),
  followerCount: Count.optional().catch(undefined),
  followers: Count.optional().catch(undefined),
  followersCount: Count.optional().catch(undefined),
  followingCount: Count.optional().catch(undefined),
  following: Count.optional().catch(undefined),
  friendCount: Count.optional().catch(undefined),
  heartCount: Count.optional().catch(undefined),
  diggCount: Count.optional().catch(undefined),
  videoCount: Count.optional().catch(undefined),
  avgViews: Count.optional().catch(undefined),
  avg_views: Count.optional().catch(undefined),
  avgLikes: Count.optional().catch(undefined),
  avg_likes: Count.optional().catch(undefined),
  mediaCount: Count.optional().catch(undefined),
  avatarThumb: HttpsUrl.optional().catch(undefined),
  avatarLarger: HttpsUrl.optional().catch(undefined),
  profilePicUrl: HttpsUrl.optional().catch(undefined),
  profile_pic_url: HttpsUrl.optional().catch(undefined),
}).passthrough();

/**
 * Zod schema for the top-level ScrapeCreators API response.
 * Accepts either `{ data: ProfileObject }` or a flat profile object.
 */
const ScrapeCreatorsResponseSchema = z.union([
  z.object({ data: ScrapeCreatorsProfileSchema }).passthrough(),
  ScrapeCreatorsProfileSchema,
]);

type ScrapeCreatorsProfile = z.infer<typeof ScrapeCreatorsProfileSchema>;

export { ScrapeCreatorsProfileSchema, ScrapeCreatorsResponseSchema };

function extractProfileData(
  data: ScrapeCreatorsProfile,
  handle: string,
  platform: Platform
): Omit<Influencer, 'id' | 'user_id' | 'created_at'> {
  let full_name: string | null = null;
  let bio: string | null = null;
  let followers: number | null = null;
  let following: number | null = null;
  let avg_likes: number | null = null;
  let avg_views: number | null = null;
  let profile_pic_url: string | null = null;
  let profile_url: string | null = null;

  // Normalize fields across platforms.
  //
  // Audit L6: previously fell back to `handle` when no display name was
  // present, conflating the two semantically distinct fields and routing
  // the (public) handle through PII encryption.  Leave `full_name` null
  // when no genuine display name is provided.
  full_name =
    data.full_name ??
    data.name ??
    data.nickname ??
    data.uniqueId ??
    null;

  bio = data.biography ?? data.bio ?? data.signature ?? null;

  followers =
    data.followerCount ??
    data.followers ??
    data.followersCount ??
    null;

  following =
    data.followingCount ??
    data.following ??
    data.friendCount ??
    null;

  avg_likes =
    data.avg_likes ??
    data.avgLikes ??
    data.heartCount ??
    null;

  avg_views =
    data.avg_views ??
    data.avgViews ??
    null;

  profile_pic_url =
    data.profile_pic_url ??
    data.profilePicUrl ??
    data.avatarLarger ??
    data.avatarThumb ??
    null;

  // Build profile URL per platform (encode handle for URL safety)
  const encodedHandle = encodeURIComponent(handle);
  switch (platform) {
    case 'tiktok':
      profile_url = `https://www.tiktok.com/@${encodedHandle}`;
      break;
    case 'instagram':
      profile_url = `https://www.instagram.com/${encodedHandle}`;
      break;
    case 'youtube':
      profile_url = `https://www.youtube.com/@${encodedHandle}`;
      break;
    case 'twitter':
      profile_url = `https://twitter.com/${encodedHandle}`;
      break;
  }

  const engagement_rate =
    Number.isFinite(followers as number) &&
    Number.isFinite(avg_likes as number) &&
    (followers as number) > 0
      ? Math.min(100, Math.max(0, ((avg_likes as number) / (followers as number)) * 100))
      : null;

  return {
    handle,
    platform,
    full_name,
    bio,
    followers,
    following,
    avg_likes,
    avg_views,
    engagement_rate,
    profile_pic_url,
    profile_url,
    niche: null,
    status: 'prospect',
    notes: null,
    last_scraped: new Date().toISOString(),
  };
}

export async function scrapeProfile(
  handle: string,
  platform: Platform
): Promise<Omit<Influencer, 'id' | 'user_id' | 'created_at'>> {
  // Normalize handle to lowercase to prevent duplicate records
  const normalizedHandle = handle.toLowerCase();
  const cacheKey = `${platform}:${normalizedHandle}`;

  // Cache short-circuit (M1) — return a deep clone so callers can mutate
  // the result without poisoning the shared cache entry.
  const cached = scraperCache.get(cacheKey);
  if (cached) {
    return { ...cached, last_scraped: cached.last_scraped };
  }

  let url: string;

  switch (platform) {
    case 'tiktok':
      url = `https://api.scrapecreators.com/v1/tiktok/profile?handle=${encodeURIComponent(normalizedHandle)}`;
      break;
    case 'instagram':
      url = `https://api.scrapecreators.com/v1/instagram/profile?handle=${encodeURIComponent(normalizedHandle)}`;
      break;
    case 'youtube':
      url = `https://api.scrapecreators.com/v1/youtube/channel?handle=${encodeURIComponent(normalizedHandle)}`;
      break;
    case 'twitter':
      url = `https://api.scrapecreators.com/v1/twitter/profile?handle=${encodeURIComponent(normalizedHandle)}`;
      break;
    default:
      throw new Error(`Unsupported platform: ${platform}`);
  }

  const response = await scrapeClient.get(url);

  // Validate the API response against the schema
  const parseResult = ScrapeCreatorsResponseSchema.safeParse(response.data);
  if (!parseResult.success) {
    logger.error(
      { err: parseResult.error, platform, handle },
      'ScrapeCreators API returned an invalid response',
    );
    throw new Error('ScrapeCreators API returned an invalid response');
  }

  const validated = parseResult.data;
  const profileData: ScrapeCreatorsProfile =
    'data' in validated && validated.data && typeof validated.data === 'object'
      ? (validated.data as ScrapeCreatorsProfile)
      : (validated as ScrapeCreatorsProfile);

  const result = extractProfileData(profileData, normalizedHandle, platform);
  scraperCache.set(cacheKey, result);
  return result;
}
