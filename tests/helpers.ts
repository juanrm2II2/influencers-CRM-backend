import jwt from 'jsonwebtoken';

const JWT_SECRET = process.env.SUPABASE_JWT_SECRET!;

/**
 * Generate a valid JWT token for testing.
 */
export function generateToken(
  payload: { sub: string; email?: string; role?: string },
  options?: jwt.SignOptions
): string {
  return jwt.sign(payload, JWT_SECRET, {
    algorithm: 'HS256',
    expiresIn: '1h',
    ...options,
  });
}

/** A valid UUID for test use */
export const TEST_UUID = '550e8400-e29b-41d4-a716-446655440000';

/** A sample influencer record */
export const SAMPLE_INFLUENCER = {
  id: TEST_UUID,
  handle: 'testuser',
  platform: 'tiktok' as const,
  full_name: 'Test User',
  bio: 'Test bio',
  followers: 100000,
  following: 500,
  avg_likes: 5000,
  avg_views: 50000,
  engagement_rate: 5.0,
  profile_pic_url: 'https://example.com/pic.jpg',
  profile_url: 'https://www.tiktok.com/@testuser',
  niche: 'tech',
  status: 'prospect' as const,
  notes: null,
  last_scraped: '2025-01-01T00:00:00.000Z',
  created_at: '2025-01-01T00:00:00.000Z',
};

/** A sample outreach record */
export const SAMPLE_OUTREACH = {
  id: '660e8400-e29b-41d4-a716-446655440001',
  influencer_id: TEST_UUID,
  contact_date: '2025-01-15T00:00:00.000Z',
  channel: 'email' as const,
  message_sent: 'Hello, interested in collaboration?',
  response: null,
  follow_up_date: '2025-01-22T00:00:00.000Z',
  created_at: '2025-01-15T00:00:00.000Z',
};
