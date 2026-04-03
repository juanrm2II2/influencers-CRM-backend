import axios from 'axios';
import { Platform, Influencer } from '../types';

const SCRAPECREATORS_API_KEY = process.env.SCRAPECREATORS_API_KEY;

if (!SCRAPECREATORS_API_KEY) {
  throw new Error('Missing SCRAPECREATORS_API_KEY environment variable');
}

const scrapeClient = axios.create({
  headers: {
    'x-api-key': SCRAPECREATORS_API_KEY,
  },
});

interface ScrapeCreatorsProfile {
  // Common fields returned across platforms
  username?: string;
  nickname?: string;
  uniqueId?: string;
  name?: string;
  full_name?: string;
  biography?: string;
  bio?: string;
  signature?: string;
  followerCount?: number;
  followers?: number;
  followersCount?: number;
  followingCount?: number;
  following?: number;
  friendCount?: number;
  heartCount?: number;
  diggCount?: number;
  videoCount?: number;
  avgViews?: number;
  avg_views?: number;
  avgLikes?: number;
  avg_likes?: number;
  mediaCount?: number;
  avatarThumb?: string;
  avatarLarger?: string;
  profilePicUrl?: string;
  profile_pic_url?: string;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  [key: string]: any;
}

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

  // Build profile URL per platform
  switch (platform) {
    case 'tiktok':
      profile_url = `https://www.tiktok.com/@${handle}`;
      break;
    case 'instagram':
      profile_url = `https://www.instagram.com/${handle}`;
      break;
    case 'youtube':
      profile_url = `https://www.youtube.com/@${handle}`;
      break;
    case 'twitter':
      profile_url = `https://twitter.com/${handle}`;
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
  let url: string;

  switch (platform) {
    case 'tiktok':
      url = `https://api.scrapecreators.com/v1/tiktok/profile?handle=${encodeURIComponent(handle)}`;
      break;
    case 'instagram':
      url = `https://api.scrapecreators.com/v1/instagram/profile?handle=${encodeURIComponent(handle)}`;
      break;
    case 'youtube':
      url = `https://api.scrapecreators.com/v1/youtube/channel?handle=${encodeURIComponent(handle)}`;
      break;
    case 'twitter':
      url = `https://api.scrapecreators.com/v1/twitter/profile?handle=${encodeURIComponent(handle)}`;
      break;
    default:
      throw new Error(`Unsupported platform: ${platform}`);
  }

  const response = await scrapeClient.get<ScrapeCreatorsProfile>(url);
  const profileData: ScrapeCreatorsProfile =
    response.data?.data ?? response.data;

  return extractProfileData(profileData, handle, platform);
}
