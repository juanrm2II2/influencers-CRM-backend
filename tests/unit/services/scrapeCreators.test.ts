/**
 * Unit tests for scrapeCreators service.
 *
 * We test the extractProfileData logic indirectly through scrapeProfile,
 * mocking only the axios HTTP calls.
 */
import axios from 'axios';

// Mock axios.create to return an object with a mocked get method
const mockGet = jest.fn();
const mockRequestInterceptorUse = jest.fn();
jest.mock('axios', () => ({
  ...jest.requireActual('axios'),
  create: jest.fn(() => ({
    get: mockGet,
    interceptors: {
      request: { use: mockRequestInterceptorUse },
      response: { use: jest.fn() },
    },
  })),
}));

import { scrapeProfile } from '../../../src/services/scrapeCreators';

beforeEach(() => {
  jest.clearAllMocks();
});

describe('scrapeProfile', () => {
  it('should fetch and normalize TikTok profile data', async () => {
    mockGet.mockResolvedValue({
      data: {
        data: {
          nickname: 'TikTok User',
          signature: 'I make videos',
          followerCount: 100000,
          followingCount: 500,
          heartCount: 5000000,
          avgViews: 50000,
          avatarLarger: 'https://example.com/avatar.jpg',
        },
      },
    });

    const result = await scrapeProfile('testuser', 'tiktok');

    expect(result.handle).toBe('testuser');
    expect(result.platform).toBe('tiktok');
    expect(result.full_name).toBe('TikTok User');
    expect(result.bio).toBe('I make videos');
    expect(result.followers).toBe(100000);
    expect(result.following).toBe(500);
    expect(result.profile_url).toBe('https://www.tiktok.com/@testuser');
    expect(result.status).toBe('prospect');
    expect(result.niche).toBeNull();
    expect(mockGet).toHaveBeenCalledWith(
      expect.stringContaining('tiktok/profile?handle=testuser')
    );
  });

  it('should fetch and normalize Instagram profile data', async () => {
    mockGet.mockResolvedValue({
      data: {
        data: {
          full_name: 'Insta User',
          biography: 'Photographer',
          followers: 200000,
          following: 1000,
          avg_likes: 10000,
          profile_pic_url: 'https://example.com/pic.jpg',
        },
      },
    });

    const result = await scrapeProfile('instauser', 'instagram');

    expect(result.handle).toBe('instauser');
    expect(result.platform).toBe('instagram');
    expect(result.full_name).toBe('Insta User');
    expect(result.bio).toBe('Photographer');
    expect(result.followers).toBe(200000);
    expect(result.profile_url).toBe('https://www.instagram.com/instauser');
  });

  it('should fetch and normalize YouTube profile data', async () => {
    mockGet.mockResolvedValue({
      data: {
        data: {
          name: 'YouTube Creator',
          bio: 'Tech reviews',
          followersCount: 500000,
          following: 50,
          avgLikes: 20000,
          avgViews: 100000,
          profilePicUrl: 'https://example.com/yt.jpg',
        },
      },
    });

    const result = await scrapeProfile('ytcreator', 'youtube');

    expect(result.handle).toBe('ytcreator');
    expect(result.platform).toBe('youtube');
    expect(result.full_name).toBe('YouTube Creator');
    expect(result.profile_url).toBe('https://www.youtube.com/@ytcreator');
  });

  it('should fetch and normalize Twitter profile data', async () => {
    mockGet.mockResolvedValue({
      data: {
        data: {
          name: 'Twitter User',
          bio: 'Tweeting',
          followers: 300000,
          friendCount: 2000,
          avg_likes: 5000,
        },
      },
    });

    const result = await scrapeProfile('tweetuser', 'twitter');

    expect(result.handle).toBe('tweetuser');
    expect(result.platform).toBe('twitter');
    expect(result.profile_url).toBe('https://twitter.com/tweetuser');
  });

  it('should calculate engagement rate when followers and avg_likes are present', async () => {
    mockGet.mockResolvedValue({
      data: {
        data: {
          followers: 100000,
          avg_likes: 5000,
        },
      },
    });

    const result = await scrapeProfile('user', 'tiktok');

    expect(result.engagement_rate).toBe(5.0);
  });

  it('should return null engagement_rate when followers is 0', async () => {
    mockGet.mockResolvedValue({
      data: {
        data: {
          followers: 0,
          avg_likes: 100,
        },
      },
    });

    const result = await scrapeProfile('user', 'tiktok');

    expect(result.engagement_rate).toBeNull();
  });

  it('should return null engagement_rate when avg_likes is missing', async () => {
    mockGet.mockResolvedValue({
      data: {
        data: {
          followers: 100000,
        },
      },
    });

    const result = await scrapeProfile('user', 'tiktok');

    expect(result.engagement_rate).toBeNull();
  });

  it('should throw for unsupported platform', async () => {
    await expect(
      scrapeProfile('user', 'linkedin' as never)
    ).rejects.toThrow('Unsupported platform: linkedin');
  });

  it('should propagate API errors', async () => {
    mockGet.mockRejectedValue(new Error('Network error'));

    await expect(
      scrapeProfile('user', 'tiktok')
    ).rejects.toThrow('Network error');
  });

  it('should handle response.data without nested data property', async () => {
    mockGet.mockResolvedValue({
      data: {
        nickname: 'Direct User',
        followerCount: 50000,
      },
    });

    const result = await scrapeProfile('directuser', 'tiktok');

    expect(result.full_name).toBe('Direct User');
    expect(result.followers).toBe(50000);
  });

  it('should URL-encode handles with special characters', async () => {
    mockGet.mockResolvedValue({
      data: { data: { name: 'User' } },
    });

    await scrapeProfile('user name', 'tiktok');

    expect(mockGet).toHaveBeenCalledWith(
      expect.stringContaining('handle=user%20name')
    );
  });

  it('should set last_scraped to a valid ISO date', async () => {
    mockGet.mockResolvedValue({
      data: { data: {} },
    });

    const result = await scrapeProfile('user', 'tiktok');

    expect(result.last_scraped).toBeDefined();
    expect(new Date(result.last_scraped!).toISOString()).toBe(result.last_scraped);
  });
});

describe('HTTPS-only interceptor', () => {
  // The interceptor is registered when the module loads (before clearAllMocks
  // in beforeEach). We capture the callback reference once here.
  const interceptor = (() => {
    // axios.create is called at module-load time; its return value's
    // interceptors.request.use was invoked with the interceptor callback.
    const createMock = axios.create as jest.Mock;
    const clientInstance = createMock.mock.results[0]?.value;
    return clientInstance?.interceptors?.request?.use?.mock?.calls?.[0]?.[0];
  })();

  it('should register a request interceptor on the axios client', () => {
    expect(interceptor).toBeDefined();
    expect(typeof interceptor).toBe('function');
  });

  it('should allow HTTPS URLs', () => {
    const config = { url: 'https://api.scrapecreators.com/v1/tiktok/profile' };
    expect(interceptor(config)).toBe(config);
  });

  it('should reject HTTP URLs', () => {
    const config = { url: 'http://api.scrapecreators.com/v1/tiktok/profile' };
    expect(() => interceptor(config)).toThrow('Only HTTPS requests are allowed');
  });

  it('should reject URLs with non-HTTPS scheme', () => {
    const config = { url: 'ftp://example.com/file' };
    expect(() => interceptor(config)).toThrow('Only HTTPS requests are allowed');
  });

  it('should allow when url is empty (baseURL may be used)', () => {
    const config = { url: '' };
    expect(interceptor(config)).toBe(config);
  });
});
