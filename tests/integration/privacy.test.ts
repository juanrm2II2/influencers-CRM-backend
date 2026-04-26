import request from 'supertest';
import { generateToken } from '../helpers';

// Mock supabase before importing app
const mockSelect = jest.fn();
const mockSingle = jest.fn();
const mockOrder = jest.fn();
const mockEq = jest.fn();
const mockInsert = jest.fn();
const mockUpdate = jest.fn();
const mockDelete = jest.fn();
const mockUpsert = jest.fn();
const mockFrom = jest.fn();
const mockNot = jest.fn();
const mockLt = jest.fn();
const mockMaybeSingle = jest.fn();

const queryChain: Record<string, jest.Mock> = {
  select: mockSelect,
  single: mockSingle,
  order: mockOrder,
  eq: mockEq,
  insert: mockInsert,
  update: mockUpdate,
  delete: mockDelete,
  upsert: mockUpsert,
  from: mockFrom,
  not: mockNot,
  lt: mockLt,
  maybeSingle: mockMaybeSingle,
};

function setupChain() {
  for (const key of Object.keys(queryChain)) {
    queryChain[key].mockReturnValue(queryChain);
  }
  mockFrom.mockReturnValue(queryChain);
}

setupChain();

jest.mock('../../src/services/supabase', () => ({
  supabase: { from: mockFrom },
  createScopedClient: jest.fn(() => ({ from: mockFrom })),
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

import { createApp } from '../../src/app';

const app = createApp();

const userToken = generateToken({ sub: 'user-1', email: 'user@test.com', role: 'user' });
const adminToken = generateToken({ sub: 'admin-1', email: 'admin@test.com', role: 'admin' });

beforeEach(() => {
  jest.clearAllMocks();
  // Remove any thenable set by previous tests before re-setting up chain
  delete (queryChain as any).then;
  setupChain();
  jest.spyOn(console, 'error').mockImplementation();
  jest.spyOn(console, 'log').mockImplementation();
});

afterEach(() => {
  (console.error as jest.Mock).mockRestore?.();
  (console.log as jest.Mock).mockRestore?.();
});

// ---------------------------------------------------------------------------
// Consent endpoints
// ---------------------------------------------------------------------------
describe('GET /api/privacy/consent', () => {
  it('should return 401 without auth', async () => {
    const res = await request(app).get('/api/privacy/consent');
    expect(res.status).toBe(401);
  });

  it('should return consent records for the user', async () => {
    const consents = [{ id: 'c1', consent_type: 'marketing', granted: true }];
    mockOrder.mockResolvedValueOnce({ data: consents, error: null });

    const res = await request(app)
      .get('/api/privacy/consent')
      .set('Authorization', `Bearer ${userToken}`);

    expect(res.status).toBe(200);
    expect(res.body.data).toEqual(consents);
  });
});

describe('POST /api/privacy/consent', () => {
  it('should reject invalid consent_type', async () => {
    const res = await request(app)
      .post('/api/privacy/consent')
      .set('Authorization', `Bearer ${userToken}`)
      .send({ consent_type: 'invalid', granted: true });

    expect(res.status).toBe(400);
  });

  it('should reject non-boolean granted', async () => {
    const res = await request(app)
      .post('/api/privacy/consent')
      .set('Authorization', `Bearer ${userToken}`)
      .send({ consent_type: 'marketing', granted: 'yes' });

    expect(res.status).toBe(400);
  });

  it('should accept valid consent update', async () => {
    const record = { id: 'c1', consent_type: 'marketing', granted: true };
    mockSingle.mockResolvedValueOnce({ data: record, error: null });

    const res = await request(app)
      .post('/api/privacy/consent')
      .set('Authorization', `Bearer ${userToken}`)
      .send({ consent_type: 'marketing', granted: true });

    expect(res.status).toBe(200);
    expect(res.body).toEqual(record);
  });
});

// ---------------------------------------------------------------------------
// DSAR endpoints
// ---------------------------------------------------------------------------
describe('GET /api/privacy/requests', () => {
  it('should return DSAR requests', async () => {
    const requests = [{ id: 'd1', request_type: 'access', status: 'pending' }];
    mockOrder.mockResolvedValueOnce({ data: requests, error: null });

    const res = await request(app)
      .get('/api/privacy/requests')
      .set('Authorization', `Bearer ${userToken}`);

    expect(res.status).toBe(200);
    expect(res.body.data).toEqual(requests);
  });
});

describe('POST /api/privacy/requests', () => {
  it('should create a DSAR request', async () => {
    const record = { id: 'd1', request_type: 'access', status: 'pending' };
    mockSingle.mockResolvedValueOnce({ data: record, error: null });

    const res = await request(app)
      .post('/api/privacy/requests')
      .set('Authorization', `Bearer ${userToken}`)
      .send({ request_type: 'access' });

    expect(res.status).toBe(201);
  });

  it('should reject invalid request_type', async () => {
    const res = await request(app)
      .post('/api/privacy/requests')
      .set('Authorization', `Bearer ${userToken}`)
      .send({ request_type: 'hack' });

    expect(res.status).toBe(400);
  });
});

describe('PATCH /api/privacy/requests/:id', () => {
  it('should require admin role', async () => {
    const res = await request(app)
      .patch('/api/privacy/requests/550e8400-e29b-41d4-a716-446655440000')
      .set('Authorization', `Bearer ${userToken}`)
      .send({ status: 'completed' });

    expect(res.status).toBe(403);
  });

  it('should allow admin to update status', async () => {
    const record = { id: '550e8400-e29b-41d4-a716-446655440000', status: 'completed' };
    mockSingle.mockResolvedValueOnce({ data: record, error: null });

    const res = await request(app)
      .patch('/api/privacy/requests/550e8400-e29b-41d4-a716-446655440000')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ status: 'completed' });

    expect(res.status).toBe(200);
  });

  it('should reject invalid UUID', async () => {
    const res = await request(app)
      .patch('/api/privacy/requests/not-a-uuid')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ status: 'completed' });

    expect(res.status).toBe(400);
  });
});

// ---------------------------------------------------------------------------
// Export endpoint
// ---------------------------------------------------------------------------
describe('GET /api/privacy/export', () => {
  it('should export user data with correct headers', async () => {
    // The export function calls 3 from() chains that each await the result.
    // Chain 1: from('audit_log').select(...).eq(...).order(...) → order is terminal
    // Chain 2: from('consent').select('*').eq(...)  → eq is terminal
    // Chain 3: from('dsar_requests').select('*').eq(...) → eq is terminal
    //
    // We make the queryChain a thenable so `await chain` resolves properly.
    const resolvedData = { data: [], error: null };

    // Make the chain itself thenable so awaiting any chain position resolves
    (queryChain as any).then = (resolve: (v: unknown) => void) => {
      resolve(resolvedData);
      return { catch: () => ({}) };
    };

    const res = await request(app)
      .get('/api/privacy/export')
      .set('Authorization', `Bearer ${userToken}`);

    expect(res.status).toBe(200);
    expect(res.headers['content-disposition']).toContain('user-data-export-');
    expect(res.body).toHaveProperty('user_id');
    expect(res.body).toHaveProperty('exported_at');
  });
});

// ---------------------------------------------------------------------------
// Erasure endpoint
// ---------------------------------------------------------------------------
describe('DELETE /api/privacy/data', () => {
  it('should erase user data', async () => {
    mockDelete.mockReturnValue(queryChain);
    mockEq.mockResolvedValue({ error: null });
    mockUpdate.mockReturnValue(queryChain);

    const res = await request(app)
      .delete('/api/privacy/data')
      .set('Authorization', `Bearer ${userToken}`);

    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('message');
    expect(res.body).toHaveProperty('deletedTables');
  });

  it('should erase influencers and outreach rows (audit M1)', async () => {
    // Track which tables receive a `.delete()` call so we can assert that
    // the new GDPR Art. 17 cascade covers `outreach`, `influencers`, and
    // `consent` — previously only `consent` was deleted.
    const deletedFromTables: string[] = [];

    mockDelete.mockImplementation(() => queryChain);
    mockUpdate.mockImplementation(() => queryChain);
    mockEq.mockResolvedValue({ error: null });

    mockFrom.mockImplementation((table: string) => {
      // Wrap delete so we can record the originating table name.
      const originalDelete = queryChain.delete;
      queryChain.delete = jest.fn((...args: unknown[]) => {
        deletedFromTables.push(table);
        return originalDelete(...args);
      });
      return queryChain;
    });

    const res = await request(app)
      .delete('/api/privacy/data')
      .set('Authorization', `Bearer ${userToken}`);

    expect(res.status).toBe(200);
    expect(deletedFromTables).toEqual(
      expect.arrayContaining(['outreach', 'influencers', 'consent']),
    );
    expect(res.body.deletedTables).toEqual(
      expect.arrayContaining(['outreach', 'influencers', 'consent']),
    );
  });
});

// ---------------------------------------------------------------------------
// Purge endpoint
// ---------------------------------------------------------------------------
describe('POST /api/privacy/purge', () => {
  it('should require admin role', async () => {
    const res = await request(app)
      .post('/api/privacy/purge')
      .set('Authorization', `Bearer ${userToken}`);

    expect(res.status).toBe(403);
  });

  it('should allow admin to trigger purge', async () => {
    mockDelete.mockReturnValue(queryChain);
    mockLt.mockResolvedValue({ count: 0, error: null });

    const res = await request(app)
      .post('/api/privacy/purge')
      .set('Authorization', `Bearer ${adminToken}`);

    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('results');
  });
});
