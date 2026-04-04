import request from 'supertest';
import { generateToken, TEST_UUID, SAMPLE_INFLUENCER, SAMPLE_OUTREACH } from '../helpers';

// Mock supabase before importing app
const mockSelect = jest.fn();
const mockSingle = jest.fn();
const mockOrder = jest.fn();
const mockEq = jest.fn();
const mockIlike = jest.fn();
const mockGte = jest.fn();
const mockInsert = jest.fn();
const mockUpdate = jest.fn();
const mockDelete = jest.fn();
const mockUpsert = jest.fn();
const mockFrom = jest.fn();
const mockRange = jest.fn();

function setupChain() {
  mockSelect.mockReturnValue(queryChain);
  mockSingle.mockReturnValue(queryChain);
  mockOrder.mockReturnValue(queryChain);
  mockEq.mockReturnValue(queryChain);
  mockIlike.mockReturnValue(queryChain);
  mockGte.mockReturnValue(queryChain);
  mockInsert.mockReturnValue(queryChain);
  mockUpdate.mockReturnValue(queryChain);
  mockDelete.mockReturnValue(queryChain);
  mockUpsert.mockReturnValue(queryChain);
  mockFrom.mockReturnValue(queryChain);
  mockRange.mockReturnValue(queryChain);
}

const queryChain: Record<string, jest.Mock> = {
  select: mockSelect,
  single: mockSingle,
  order: mockOrder,
  eq: mockEq,
  ilike: mockIlike,
  gte: mockGte,
  insert: mockInsert,
  update: mockUpdate,
  delete: mockDelete,
  upsert: mockUpsert,
  from: mockFrom,
  range: mockRange,
};

// Initial setup
setupChain();

/**
 * Make the queryChain behave like a thenable that resolves with the given value.
 * This is needed for `await supabase.from(...).select(...).order(...)` to work.
 */
function mockQueryResolve(value: { data: unknown; error: unknown; count?: number }) {
  (queryChain as any).then = (resolve: (v: unknown) => void) => {
    resolve(value);
    return { catch: () => ({}) };
  };
}

jest.mock('../../src/services/supabase', () => ({
  supabase: { from: mockFrom },
}));

jest.mock('../../src/services/scrapeCreators', () => ({
  scrapeProfile: jest.fn(),
}));

jest.mock('../../src/logger', () => ({
  logger: {
    info: jest.fn(),
    error: jest.fn(),
    warn: jest.fn(),
    debug: jest.fn(),
    fatal: jest.fn(),
  },
}));

jest.mock('../../src/services/auditLog', () => ({
  recordAuditLog: jest.fn().mockResolvedValue(undefined),
}));

jest.mock('../../src/services/tokenBlocklist', () => ({
  tokenBlocklist: {
    isRevoked: jest.fn().mockResolvedValue(false),
    revoke: jest.fn().mockResolvedValue(undefined),
    destroy: jest.fn(),
  },
}));

// Must import app AFTER mocks are set up
import { createApp } from '../../src/app';
import { scrapeProfile } from '../../src/services/scrapeCreators';

const app = createApp();

const mockedScrapeProfile = scrapeProfile as jest.MockedFunction<typeof scrapeProfile>;

// Tokens for different roles
const userToken = generateToken({ sub: 'user-1', email: 'user@test.com', role: 'user' });
const adminToken = generateToken({ sub: 'admin-1', email: 'admin@test.com', role: 'admin' });

beforeEach(() => {
  jest.clearAllMocks();
  setupChain();
  // Remove any previously set thenable
  delete (queryChain as any).then;
  jest.spyOn(console, 'error').mockImplementation();
  jest.spyOn(console, 'log').mockImplementation();
});

afterEach(() => {
  (console.error as jest.Mock).mockRestore?.();
  (console.log as jest.Mock).mockRestore?.();
});

describe('GET /health', () => {
  it('should return 200 with status ok', async () => {
    const res = await request(app).get('/health');

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ status: 'ok' });
  });

  it('should not require authentication', async () => {
    const res = await request(app).get('/health');

    expect(res.status).toBe(200);
  });
});

describe('GET /api/influencers', () => {
  it('should return 401 without auth token', async () => {
    const res = await request(app).get('/api/influencers');

    expect(res.status).toBe(401);
    expect(res.body.error).toBe('Missing or malformed Authorization header');
  });

  it('should return 200 with influencers list and pagination', async () => {
    mockQueryResolve({ data: [SAMPLE_INFLUENCER], error: null, count: 1 });

    const res = await request(app)
      .get('/api/influencers')
      .set('Authorization', `Bearer ${userToken}`);

    expect(res.status).toBe(200);
    expect(res.body.data).toEqual([SAMPLE_INFLUENCER]);
    expect(res.body.pagination).toEqual({
      page: 1,
      limit: 20,
      total: 1,
      totalPages: 1,
    });
  });

  it('should apply query filters', async () => {
    mockQueryResolve({ data: [], error: null, count: 0 });

    const res = await request(app)
      .get('/api/influencers?platform=tiktok&status=active&niche=tech&min_followers=1000')
      .set('Authorization', `Bearer ${userToken}`);

    expect(res.status).toBe(200);
  });

  it('should return 400 for invalid min_followers', async () => {
    const res = await request(app)
      .get('/api/influencers?min_followers=abc')
      .set('Authorization', `Bearer ${userToken}`);

    expect(res.status).toBe(400);
  });
});

describe('GET /api/influencers/:id', () => {
  it('should return 400 for invalid UUID', async () => {
    const res = await request(app)
      .get('/api/influencers/not-a-uuid')
      .set('Authorization', `Bearer ${userToken}`);

    expect(res.status).toBe(400);
    expect(res.body.error).toBe('id must be a valid UUID');
  });

  it('should return influencer with outreach on success', async () => {
    mockSingle.mockResolvedValueOnce({ data: SAMPLE_INFLUENCER, error: null });
    mockOrder.mockResolvedValueOnce({ data: [SAMPLE_OUTREACH], error: null });

    const res = await request(app)
      .get(`/api/influencers/${TEST_UUID}`)
      .set('Authorization', `Bearer ${userToken}`);

    expect(res.status).toBe(200);
    expect(res.body).toEqual({
      ...SAMPLE_INFLUENCER,
      outreach: [SAMPLE_OUTREACH],
    });
  });

  it('should return 404 when influencer not found', async () => {
    mockSingle.mockResolvedValueOnce({ data: null, error: { message: 'Not found' } });

    const res = await request(app)
      .get(`/api/influencers/${TEST_UUID}`)
      .set('Authorization', `Bearer ${userToken}`);

    expect(res.status).toBe(404);
  });
});

describe('POST /api/influencers/search', () => {
  it('should return 401 without auth', async () => {
    const res = await request(app)
      .post('/api/influencers/search')
      .send({ handle: 'testuser', platform: 'tiktok' });

    expect(res.status).toBe(401);
  });

  it('should return 400 for missing handle', async () => {
    const res = await request(app)
      .post('/api/influencers/search')
      .set('Authorization', `Bearer ${userToken}`)
      .send({ platform: 'tiktok' });

    expect(res.status).toBe(400);
  });

  it('should return 400 for invalid platform', async () => {
    const res = await request(app)
      .post('/api/influencers/search')
      .set('Authorization', `Bearer ${userToken}`)
      .send({ handle: 'testuser', platform: 'facebook' });

    expect(res.status).toBe(400);
  });

  it('should return 201 on successful search', async () => {
    const profileData = { ...SAMPLE_INFLUENCER };
    delete (profileData as Record<string, unknown>).id;
    delete (profileData as Record<string, unknown>).created_at;

    mockedScrapeProfile.mockResolvedValue(
      profileData as ReturnType<typeof scrapeProfile> extends Promise<infer U> ? U : never
    );
    mockSingle.mockResolvedValue({ data: SAMPLE_INFLUENCER, error: null });

    const res = await request(app)
      .post('/api/influencers/search')
      .set('Authorization', `Bearer ${userToken}`)
      .send({ handle: 'testuser', platform: 'tiktok' });

    expect(res.status).toBe(201);
    expect(res.body).toEqual(SAMPLE_INFLUENCER);
  });
});

describe('POST /api/influencers/bulk-search', () => {
  it('should return 400 for empty handles array', async () => {
    const res = await request(app)
      .post('/api/influencers/bulk-search')
      .set('Authorization', `Bearer ${userToken}`)
      .send({ handles: [], platform: 'tiktok' });

    expect(res.status).toBe(400);
  });

  it('should return 400 when handles exceeds limit', async () => {
    const handles = Array.from({ length: 51 }, (_, i) => `user${i}`);
    const res = await request(app)
      .post('/api/influencers/bulk-search')
      .set('Authorization', `Bearer ${userToken}`)
      .send({ handles, platform: 'tiktok' });

    expect(res.status).toBe(400);
  });

  it('should return 201 with summary on success', async () => {
    const profileData = { ...SAMPLE_INFLUENCER };
    delete (profileData as Record<string, unknown>).id;
    delete (profileData as Record<string, unknown>).created_at;

    mockedScrapeProfile.mockResolvedValue(
      profileData as ReturnType<typeof scrapeProfile> extends Promise<infer U> ? U : never
    );
    mockSingle.mockResolvedValue({ data: SAMPLE_INFLUENCER, error: null });

    const res = await request(app)
      .post('/api/influencers/bulk-search')
      .set('Authorization', `Bearer ${userToken}`)
      .send({ handles: ['user1'], platform: 'tiktok' });

    expect(res.status).toBe(201);
    expect(res.body.total).toBe(1);
    expect(res.body.succeeded).toBe(1);
  });
});

describe('PATCH /api/influencers/:id', () => {
  it('should return 400 for invalid UUID', async () => {
    const res = await request(app)
      .patch('/api/influencers/invalid')
      .set('Authorization', `Bearer ${userToken}`)
      .send({ status: 'active' });

    expect(res.status).toBe(400);
  });

  it('should return 400 for invalid status value', async () => {
    const res = await request(app)
      .patch(`/api/influencers/${TEST_UUID}`)
      .set('Authorization', `Bearer ${userToken}`)
      .send({ status: 'invalid_status' });

    expect(res.status).toBe(400);
  });

  it('should update influencer on valid request', async () => {
    const updated = { ...SAMPLE_INFLUENCER, status: 'active' };
    mockSingle.mockResolvedValue({ data: updated, error: null });

    const res = await request(app)
      .patch(`/api/influencers/${TEST_UUID}`)
      .set('Authorization', `Bearer ${userToken}`)
      .send({ status: 'active' });

    expect(res.status).toBe(200);
    expect(res.body.status).toBe('active');
  });
});

describe('DELETE /api/influencers/:id', () => {
  it('should return 403 for non-admin user', async () => {
    const res = await request(app)
      .delete(`/api/influencers/${TEST_UUID}`)
      .set('Authorization', `Bearer ${userToken}`);

    expect(res.status).toBe(403);
    expect(res.body.error).toBe('Insufficient permissions');
  });

  it('should return 204 for admin user', async () => {
    mockEq.mockResolvedValue({ error: null });

    const res = await request(app)
      .delete(`/api/influencers/${TEST_UUID}`)
      .set('Authorization', `Bearer ${adminToken}`);

    expect(res.status).toBe(204);
  });

  it('should return 400 for invalid UUID', async () => {
    const res = await request(app)
      .delete('/api/influencers/not-valid')
      .set('Authorization', `Bearer ${adminToken}`);

    expect(res.status).toBe(400);
  });
});

describe('POST /api/influencers/:id/outreach', () => {
  it('should return 400 for invalid UUID', async () => {
    const res = await request(app)
      .post('/api/influencers/not-valid/outreach')
      .set('Authorization', `Bearer ${userToken}`)
      .send({ channel: 'email' });

    expect(res.status).toBe(400);
  });

  it('should return 400 for invalid channel', async () => {
    const res = await request(app)
      .post(`/api/influencers/${TEST_UUID}/outreach`)
      .set('Authorization', `Bearer ${userToken}`)
      .send({ channel: 'whatsapp' });

    expect(res.status).toBe(400);
  });

  it('should create outreach record on success', async () => {
    mockSingle.mockResolvedValue({ data: SAMPLE_OUTREACH, error: null });

    const res = await request(app)
      .post(`/api/influencers/${TEST_UUID}/outreach`)
      .set('Authorization', `Bearer ${userToken}`)
      .send({
        channel: 'email',
        contact_date: '2025-01-15T00:00:00.000Z',
        message_sent: 'Hello!',
      });

    expect(res.status).toBe(201);
    expect(res.body).toEqual(SAMPLE_OUTREACH);
  });
});

describe('404 for unknown routes', () => {
  it('should return 404 for unknown API route', async () => {
    const res = await request(app)
      .get('/api/nonexistent')
      .set('Authorization', `Bearer ${userToken}`);

    expect(res.status).toBe(404);
  });
});
