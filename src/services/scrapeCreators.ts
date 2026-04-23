import axios from 'axios';
import { z } from 'zod/v4';
import { Platform, Influencer } from '../types';
import { logger } from '../logger';

const SCRAPECREATORS_API_KEY = process.env.SCRAPECREATORS_API_KEY;

if (!SCRAPECREATORS_API_KEY) {
  throw new Error('Missing SCRAPECREATORS_API_KEY environment variable');
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
  followerCount: z.optional(z.number()),
  followers: z.optional(z.number()),
  followersCount: z.optional(z.number()),
  followingCount: z.optional(z.number()),
  following: z.optional(z.number()),
  friendCount: z.optional(z.number()),
  heartCount: z.optional(z.number()),
  diggCount: z.optional(z.number()),
  videoCount: z.optional(z.number()),
  avgViews: z.optional(z.number()),
  avg_views: z.optional(z.number()),
  avgLikes: z.optional(z.number()),
  avg_likes: z.optional(z.number()),
  mediaCount: z.optional(z.number()),
  avatarThumb: z.optional(z.string()),
  avatarLarger: z.optional(z.string()),
  profilePicUrl: z.optional(z.string()),
  profile_pic_url: z.optional(z.string()),
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
): Omit<Influencer, 'id' | 'created_at'> {
  let full_name: string | null = null;
  let bio: string | null = null;
  let followers: number | null = null;
  let following: number | null = null;
  let avg_likes: number | null = null;
  let avg_views: number | null = null;
  let profile_pic_url: string | null = null;
  let profile_url: string | null = null;

  // Normalize fields across platforms
  full_name =
    data.full_name ??
    data.name ??
    data.nickname ??
    data.uniqueId ??
    handle;

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
    followers && avg_likes && followers > 0
      ? (avg_likes / followers) * 100
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
): Promise<Omit<Influencer, 'id' | 'created_at'>> {
  // Normalize handle to lowercase to prevent duplicate records
  const normalizedHandle = handle.toLowerCase();
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

  return extractProfileData(profileData, normalizedHandle, platform);
}
