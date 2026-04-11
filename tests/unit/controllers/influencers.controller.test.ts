import { Request, Response } from 'express';
import { SAMPLE_INFLUENCER, SAMPLE_OUTREACH, TEST_UUID } from '../../helpers';

// Mock supabase module
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

// Build a chainable mock query builder
function chainable() {
  const chain: Record<string, jest.Mock> = {
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
  for (const key of Object.keys(chain)) {
    chain[key].mockReturnValue(chain);
  }
  return chain;
}

const queryChain = chainable();
mockFrom.mockReturnValue(queryChain);

jest.mock('../../../src/services/supabase', () => ({
  supabase: { from: mockFrom },
}));

jest.mock('../../../src/services/scrapeCreators', () => ({
  scrapeProfile: jest.fn(),
}));

jest.mock('../../../src/logger', () => ({
  logger: {
    info: jest.fn(),
    error: jest.fn(),
    warn: jest.fn(),
    debug: jest.fn(),
    fatal: jest.fn(),
  },
}));

import {
  searchInfluencer,
  getInfluencers,
  getInfluencerById,
  updateInfluencer,
  deleteInfluencer,
  createOutreach,
  bulkSearchInfluencers,
} from '../../../src/controllers/influencers.controller';
import { scrapeProfile } from '../../../src/services/scrapeCreators';

const mockedScrapeProfile = scrapeProfile as jest.MockedFunction<typeof scrapeProfile>;

function mockRes(): Partial<Response> {
  const res: Partial<Response> = {};
  res.status = jest.fn().mockReturnValue(res);
  res.json = jest.fn().mockReturnValue(res);
  res.send = jest.fn().mockReturnValue(res);
  return res;
}

beforeEach(() => {
  jest.clearAllMocks();
  // Re-setup chainable mock after clearing
  for (const key of Object.keys(queryChain)) {
    queryChain[key].mockReturnValue(queryChain);
  }
  mockFrom.mockReturnValue(queryChain);
  jest.spyOn(console, 'error').mockImplementation();
});

afterEach(() => {
  (console.error as jest.Mock).mockRestore?.();
});

describe('searchInfluencer', () => {
  it('should return 201 with data on successful search', async () => {
    const profileData = { ...SAMPLE_INFLUENCER };
    delete (profileData as Record<string, unknown>).id;
    delete (profileData as Record<string, unknown>).created_at;

    mockedScrapeProfile.mockResolvedValue(profileData as ReturnType<typeof scrapeProfile> extends Promise<infer U> ? U : never);
    mockSingle.mockResolvedValue({ data: SAMPLE_INFLUENCER, error: null });

    const req = { body: { handle: 'testuser', platform: 'tiktok' } } as Request;
    const res = mockRes() as Response;

    await searchInfluencer(req, res);

    expect(res.status).toHaveBeenCalledWith(201);
    expect(res.json).toHaveBeenCalledWith(SAMPLE_INFLUENCER);
  });

  it('should return 400 when handle is missing', async () => {
    const req = { body: { platform: 'tiktok' } } as Request;
    const res = mockRes() as Response;

    await searchInfluencer(req, res);

    expect(res.status).toHaveBeenCalledWith(400);
  });

  it('should return 400 when platform is missing', async () => {
    const req = { body: { handle: 'testuser' } } as Request;
    const res = mockRes() as Response;

    await searchInfluencer(req, res);

    expect(res.status).toHaveBeenCalledWith(400);
  });

  it('should return 500 when supabase returns an error', async () => {
    mockedScrapeProfile.mockResolvedValue({} as ReturnType<typeof scrapeProfile> extends Promise<infer U> ? U : never);
    mockSingle.mockResolvedValue({ data: null, error: { message: 'DB error' } });

    const req = { body: { handle: 'testuser', platform: 'tiktok' } } as Request;
    const res = mockRes() as Response;

    await searchInfluencer(req, res);

    expect(res.status).toHaveBeenCalledWith(500);
    expect(res.json).toHaveBeenCalledWith({ error: 'Internal server error' });
  });

  it('should return 500 when scrapeProfile throws', async () => {
    mockedScrapeProfile.mockRejectedValue(new Error('API timeout'));

    const req = { body: { handle: 'testuser', platform: 'tiktok' } } as Request;
    const res = mockRes() as Response;

    await searchInfluencer(req, res);

    expect(res.status).toHaveBeenCalledWith(500);
  });
});

describe('getInfluencers', () => {
  it('should return influencers list with pagination on success', async () => {
    const influencers = [SAMPLE_INFLUENCER];
    queryChain.then = jest.fn((resolve: (v: unknown) => void) => {
      resolve({ data: influencers, error: null, count: 1 });
    }) as unknown as jest.Mock;

    const req = { query: {} } as unknown as Request;
    const res = mockRes() as Response;

    await getInfluencers(req, res);

    expect(res.json).toHaveBeenCalledWith({
      data: influencers,
      pagination: { page: 1, limit: 20, total: 1, totalPages: 1 },
    });
  });

  it('should apply platform filter', async () => {
    queryChain.then = jest.fn((resolve: (v: unknown) => void) => {
      resolve({ data: [], error: null, count: 0 });
    }) as unknown as jest.Mock;

    const req = { query: { platform: 'tiktok' } } as unknown as Request;
    const res = mockRes() as Response;

    await getInfluencers(req, res);

    expect(mockEq).toHaveBeenCalledWith('platform', 'tiktok');
  });

  it('should apply status filter', async () => {
    queryChain.then = jest.fn((resolve: (v: unknown) => void) => {
      resolve({ data: [], error: null, count: 0 });
    }) as unknown as jest.Mock;

    const req = { query: { status: 'active' } } as unknown as Request;
    const res = mockRes() as Response;

    await getInfluencers(req, res);

    expect(mockEq).toHaveBeenCalledWith('status', 'active');
  });

  it('should apply niche filter with sanitized ILIKE', async () => {
    queryChain.then = jest.fn((resolve: (v: unknown) => void) => {
      resolve({ data: [], error: null, count: 0 });
    }) as unknown as jest.Mock;

    const req = { query: { niche: 'tech' } } as unknown as Request;
    const res = mockRes() as Response;

    await getInfluencers(req, res);

    expect(mockIlike).toHaveBeenCalledWith('niche', '%tech%');
  });

  it('should sanitize wildcard characters in niche filter', async () => {
    queryChain.then = jest.fn((resolve: (v: unknown) => void) => {
      resolve({ data: [], error: null, count: 0 });
    }) as unknown as jest.Mock;

    const req = { query: { niche: '100%_done' } } as unknown as Request;
    const res = mockRes() as Response;

    await getInfluencers(req, res);

    // % and _ should be escaped
    expect(mockIlike).toHaveBeenCalledWith('niche', '%100\\%\\_done%');
  });

  it('should return 400 for negative min_followers', async () => {
    const req = { query: { min_followers: '-1' } } as unknown as Request;
    const res = mockRes() as Response;

    await getInfluencers(req, res);

    expect(res.status).toHaveBeenCalledWith(400);
  });

  it('should return 400 for non-numeric min_followers', async () => {
    const req = { query: { min_followers: 'abc' } } as unknown as Request;
    const res = mockRes() as Response;

    await getInfluencers(req, res);

    expect(res.status).toHaveBeenCalledWith(400);
  });

  it('should apply min_followers filter', async () => {
    queryChain.then = jest.fn((resolve: (v: unknown) => void) => {
      resolve({ data: [], error: null, count: 0 });
    }) as unknown as jest.Mock;

    const req = { query: { min_followers: '1000' } } as unknown as Request;
    const res = mockRes() as Response;

    await getInfluencers(req, res);

    expect(mockGte).toHaveBeenCalledWith('followers', 1000);
  });
});

describe('getInfluencerById', () => {
  it('should return influencer with outreach data', async () => {
    // First query: influencer
    mockSingle.mockResolvedValueOnce({ data: SAMPLE_INFLUENCER, error: null });
    // Second query: outreach
    mockOrder.mockResolvedValueOnce({ data: [SAMPLE_OUTREACH], error: null });

    const req = { params: { id: TEST_UUID } } as any;
    const res = mockRes() as Response;

    await getInfluencerById(req, res);

    expect(res.json).toHaveBeenCalledWith({
      ...SAMPLE_INFLUENCER,
      outreach: [SAMPLE_OUTREACH],
    });
  });

  it('should return 404 when influencer is not found', async () => {
    mockSingle.mockResolvedValueOnce({ data: null, error: { message: 'Not found' } });

    const req = { params: { id: TEST_UUID } } as any;
    const res = mockRes() as Response;

    await getInfluencerById(req, res);

    expect(res.status).toHaveBeenCalledWith(404);
    expect(res.json).toHaveBeenCalledWith({ error: 'Influencer not found' });
  });

  it('should return 500 when outreach query fails', async () => {
    mockSingle.mockResolvedValueOnce({ data: SAMPLE_INFLUENCER, error: null });
    mockOrder.mockResolvedValueOnce({ data: null, error: { message: 'DB error' } });

    const req = { params: { id: TEST_UUID } } as any;
    const res = mockRes() as Response;

    await getInfluencerById(req, res);

    expect(res.status).toHaveBeenCalledWith(500);
  });
});

describe('updateInfluencer', () => {
  it('should update and return updated influencer', async () => {
    const updated = { ...SAMPLE_INFLUENCER, status: 'active' };
    mockSingle.mockResolvedValue({ data: updated, error: null });

    const req = { params: { id: TEST_UUID }, body: { status: 'active' } } as any;
    const res = mockRes() as Response;

    await updateInfluencer(req, res);

    expect(res.json).toHaveBeenCalledWith(updated);
  });

  it('should return 400 when no valid fields provided', async () => {
    const req = { params: { id: TEST_UUID }, body: {} } as any;
    const res = mockRes() as Response;

    await updateInfluencer(req, res);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith({ error: 'No valid fields to update' });
  });

  it('should return 404 when influencer does not exist', async () => {
    mockSingle.mockResolvedValue({ data: null, error: { message: 'JSON object requested, multiple (or no) rows returned', code: 'PGRST116' } });

    const req = { params: { id: TEST_UUID }, body: { niche: 'tech' } } as any;
    const res = mockRes() as Response;

    await updateInfluencer(req, res);

    expect(res.status).toHaveBeenCalledWith(404);
    expect(res.json).toHaveBeenCalledWith({ error: 'Influencer not found' });
  });

  it('should return 500 on supabase error', async () => {
    mockSingle.mockResolvedValue({ data: null, error: { message: 'DB error' } });

    const req = { params: { id: TEST_UUID }, body: { niche: 'tech' } } as any;
    const res = mockRes() as Response;

    await updateInfluencer(req, res);

    expect(res.status).toHaveBeenCalledWith(500);
  });
});

describe('deleteInfluencer', () => {
  it('should return 204 on successful deletion', async () => {
    mockSelect.mockResolvedValue({ data: [SAMPLE_INFLUENCER], error: null });

    const req = { params: { id: TEST_UUID } } as any;
    const res = mockRes() as Response;

    await deleteInfluencer(req, res);

    expect(res.status).toHaveBeenCalledWith(204);
    expect(res.send).toHaveBeenCalled();
  });

  it('should return 404 when influencer does not exist', async () => {
    mockSelect.mockResolvedValue({ data: [], error: null });

    const req = { params: { id: TEST_UUID } } as any;
    const res = mockRes() as Response;

    await deleteInfluencer(req, res);

    expect(res.status).toHaveBeenCalledWith(404);
    expect(res.json).toHaveBeenCalledWith({ error: 'Influencer not found' });
  });

  it('should return 500 on supabase error', async () => {
    mockSelect.mockResolvedValue({ data: null, error: { message: 'DB error' } });

    const req = { params: { id: TEST_UUID } } as any;
    const res = mockRes() as Response;

    await deleteInfluencer(req, res);

    expect(res.status).toHaveBeenCalledWith(500);
  });
});

describe('createOutreach', () => {
  it('should return 201 with outreach data on success', async () => {
    mockSingle.mockResolvedValue({ data: SAMPLE_OUTREACH, error: null });

    const req = {
      params: { id: TEST_UUID },
      body: { channel: 'email', contact_date: '2025-01-15T00:00:00.000Z', message_sent: 'Hello!' },
    } as any;
    const res = mockRes() as Response;

    await createOutreach(req, res);

    expect(res.status).toHaveBeenCalledWith(201);
    expect(res.json).toHaveBeenCalledWith(SAMPLE_OUTREACH);
  });

  it('should return 500 on supabase error', async () => {
    mockSingle.mockResolvedValue({ data: null, error: { message: 'DB error' } });

    const req = {
      params: { id: TEST_UUID },
      body: {},
    } as any;
    const res = mockRes() as Response;

    await createOutreach(req, res);

    expect(res.status).toHaveBeenCalledWith(500);
  });

  it('should return 404 when influencer does not exist (FK violation)', async () => {
    mockSingle.mockResolvedValue({ data: null, error: { message: 'insert or update on table "outreach" violates foreign key constraint', code: '23503' } });

    const req = {
      params: { id: TEST_UUID },
      body: { channel: 'email' },
    } as any;
    const res = mockRes() as Response;

    await createOutreach(req, res);

    expect(res.status).toHaveBeenCalledWith(404);
    expect(res.json).toHaveBeenCalledWith({ error: 'Influencer not found' });
  });
});

describe('bulkSearchInfluencers', () => {
  it('should return 201 with summary on success', async () => {
    const profileData = { ...SAMPLE_INFLUENCER };
    delete (profileData as Record<string, unknown>).id;
    delete (profileData as Record<string, unknown>).created_at;

    mockedScrapeProfile.mockResolvedValue(profileData as ReturnType<typeof scrapeProfile> extends Promise<infer U> ? U : never);
    mockSingle.mockResolvedValue({ data: SAMPLE_INFLUENCER, error: null });

    const req = { body: { handles: ['user1', 'user2'], platform: 'tiktok' } } as Request;
    const res = mockRes() as Response;

    await bulkSearchInfluencers(req, res);

    expect(res.status).toHaveBeenCalledWith(201);
    const result = (res.json as jest.Mock).mock.calls[0][0];
    expect(result.total).toBe(2);
    expect(result.succeeded).toBe(2);
  });

  it('should return 400 when handles is not provided', async () => {
    const req = { body: { platform: 'tiktok' } } as Request;
    const res = mockRes() as Response;

    await bulkSearchInfluencers(req, res);

    expect(res.status).toHaveBeenCalledWith(400);
  });

  it('should handle partial failures in bulk search', async () => {
    const profileData = { ...SAMPLE_INFLUENCER };
    delete (profileData as Record<string, unknown>).id;
    delete (profileData as Record<string, unknown>).created_at;

    mockedScrapeProfile
      .mockResolvedValueOnce(profileData as ReturnType<typeof scrapeProfile> extends Promise<infer U> ? U : never)
      .mockRejectedValueOnce(new Error('API error'));

    mockSingle.mockResolvedValue({ data: SAMPLE_INFLUENCER, error: null });

    const req = { body: { handles: ['user1', 'user2'], platform: 'tiktok' } } as Request;
    const res = mockRes() as Response;

    await bulkSearchInfluencers(req, res);

    const result = (res.json as jest.Mock).mock.calls[0][0];
    expect(result.succeeded).toBe(1);
    expect(result.failed).toBe(1);
  });
});
