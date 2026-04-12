import request from 'supertest';
import { generateToken } from '../helpers';

// ---------------------------------------------------------------------------
// Mocks — set up before importing app
// ---------------------------------------------------------------------------

const mockSelect = jest.fn();
const mockSingle = jest.fn();
const mockEq = jest.fn();
const mockMaybeSingle = jest.fn();
const mockUpsert = jest.fn();
const mockFrom = jest.fn();

const queryChain: Record<string, jest.Mock> = {
  select: mockSelect,
  single: mockSingle,
  eq: mockEq,
  maybeSingle: mockMaybeSingle,
  upsert: mockUpsert,
  from: mockFrom,
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

// Mock axios (for Sumsub API calls in kyc service)
// Also needs `create` for scrapeCreators module which is loaded transitively
jest.mock('axios', () => {
  const fn = jest.fn().mockResolvedValue({ data: { id: 'sumsub-applicant-123' } });
  (fn as any).create = jest.fn().mockReturnValue({
    get: jest.fn(),
    post: jest.fn(),
    interceptors: {
      request: { use: jest.fn() },
      response: { use: jest.fn() },
    },
  });
  return { __esModule: true, default: fn };
});

import { createApp } from '../../src/app';
import axios from 'axios';

const app = createApp();

const userToken = generateToken({ sub: 'user-1', email: 'user@test.com', role: 'user' });
const adminToken = generateToken({ sub: 'admin-1', email: 'admin@test.com', role: 'admin' });

beforeEach(() => {
  jest.clearAllMocks();
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
// POST /api/kyc/verify
// ---------------------------------------------------------------------------
describe('POST /api/kyc/verify', () => {
  it('should return 401 without auth', async () => {
    const res = await request(app)
      .post('/api/kyc/verify')
      .send({ country: 'USA', id_doc_type: 'PASSPORT' });

    expect(res.status).toBe(401);
  });

  it('should return 400 for missing country', async () => {
    const res = await request(app)
      .post('/api/kyc/verify')
      .set('Authorization', `Bearer ${userToken}`)
      .send({ id_doc_type: 'PASSPORT' });

    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/country/);
  });

  it('should return 400 for invalid country format', async () => {
    const res = await request(app)
      .post('/api/kyc/verify')
      .set('Authorization', `Bearer ${userToken}`)
      .send({ country: 'us', id_doc_type: 'PASSPORT' });

    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/country/);
  });

  it('should return 400 for invalid id_doc_type', async () => {
    const res = await request(app)
      .post('/api/kyc/verify')
      .set('Authorization', `Bearer ${userToken}`)
      .send({ country: 'USA', id_doc_type: 'INVALID' });

    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/id_doc_type/);
  });

  it('should return 400 for missing id_doc_type', async () => {
    const res = await request(app)
      .post('/api/kyc/verify')
      .set('Authorization', `Bearer ${userToken}`)
      .send({ country: 'USA' });

    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/id_doc_type/);
  });

  it('should initiate KYC verification successfully', async () => {
    // First call: getKycByUserId — no existing record
    mockMaybeSingle.mockResolvedValueOnce({ data: null, error: null });

    // Second call: upsertKycRecord
    const kycRecord = {
      id: 'kyc-1',
      user_id: 'user-1',
      kyc_status: 'pending',
      provider: 'sumsub',
      applicant_id: 'sumsub-applicant-123',
      created_at: '2026-01-01T00:00:00.000Z',
    };
    mockSingle.mockResolvedValueOnce({ data: kycRecord, error: null });

    const res = await request(app)
      .post('/api/kyc/verify')
      .set('Authorization', `Bearer ${userToken}`)
      .send({ country: 'USA', id_doc_type: 'PASSPORT' });

    expect(res.status).toBe(201);
    expect(res.body.kyc_status).toBe('pending');
    expect(res.body.applicant_id).toBe('sumsub-applicant-123');
    expect(res.body.message).toBe('KYC verification initiated');
  });

  it('should return already verified if user is verified', async () => {
    const existingRecord = {
      id: 'kyc-1',
      user_id: 'user-1',
      kyc_status: 'verified',
      provider: 'sumsub',
      applicant_id: 'sumsub-applicant-123',
    };
    mockMaybeSingle.mockResolvedValueOnce({ data: existingRecord, error: null });

    const res = await request(app)
      .post('/api/kyc/verify')
      .set('Authorization', `Bearer ${userToken}`)
      .send({ country: 'USA', id_doc_type: 'PASSPORT' });

    expect(res.status).toBe(201);
    expect(res.body.kyc_status).toBe('verified');
    expect(res.body.message).toBe('KYC already verified');
  });

  it('should return 502 when Sumsub is unavailable', async () => {
    // No existing record
    mockMaybeSingle.mockResolvedValueOnce({ data: null, error: null });

    // Mock axios to fail
    (axios as unknown as jest.Mock).mockRejectedValueOnce(
      Object.assign(new Error('Network Error'), { response: { status: 503 } })
    );

    const res = await request(app)
      .post('/api/kyc/verify')
      .set('Authorization', `Bearer ${userToken}`)
      .send({ country: 'USA', id_doc_type: 'PASSPORT' });

    expect(res.status).toBe(502);
    expect(res.body.error).toMatch(/KYC provider/);
  });
});

// ---------------------------------------------------------------------------
// GET /api/kyc/status/:userId
// ---------------------------------------------------------------------------
describe('GET /api/kyc/status/:userId', () => {
  it('should return 401 without auth', async () => {
    const res = await request(app).get('/api/kyc/status/user-1');

    expect(res.status).toBe(401);
  });

  it('should return 400 for empty userId', async () => {
    // The route won't match an empty segment, so this is a 404 from Express
    const res = await request(app)
      .get('/api/kyc/status/')
      .set('Authorization', `Bearer ${userToken}`);

    // Express will return 404 for missing route segment
    expect([400, 404]).toContain(res.status);
  });

  it('should allow user to check their own KYC status', async () => {
    const record = {
      id: 'kyc-1',
      user_id: 'user-1',
      kyc_status: 'pending',
      provider: 'sumsub',
      applicant_id: 'sumsub-applicant-123',
      verified_at: null,
      rejection_reason: null,
    };
    // syncVerificationStatus calls getKycByUserId
    mockMaybeSingle.mockResolvedValueOnce({ data: record, error: null });

    const res = await request(app)
      .get('/api/kyc/status/user-1')
      .set('Authorization', `Bearer ${userToken}`);

    expect(res.status).toBe(200);
    expect(res.body.kyc_status).toBe('pending');
  });

  it('should deny non-admin checking another users status', async () => {
    const res = await request(app)
      .get('/api/kyc/status/other-user')
      .set('Authorization', `Bearer ${userToken}`);

    expect(res.status).toBe(403);
    expect(res.body.error).toMatch(/own KYC status/);
  });

  it('should allow admin to check any users status', async () => {
    const record = {
      id: 'kyc-2',
      user_id: 'user-1',
      kyc_status: 'verified',
      applicant_id: 'app-123',
      verified_at: '2026-01-01T00:00:00.000Z',
      rejection_reason: null,
    };
    mockMaybeSingle.mockResolvedValueOnce({ data: record, error: null });

    const res = await request(app)
      .get('/api/kyc/status/user-1')
      .set('Authorization', `Bearer ${adminToken}`);

    expect(res.status).toBe(200);
    expect(res.body.kyc_status).toBe('verified');
  });

  it('should return pending when no KYC record exists', async () => {
    // syncVerificationStatus: getKycByUserId returns null → throws
    mockMaybeSingle.mockResolvedValueOnce({ data: null, error: null });
    // getKycByUserId fallback in catch
    mockMaybeSingle.mockResolvedValueOnce({ data: null, error: null });

    const res = await request(app)
      .get('/api/kyc/status/user-1')
      .set('Authorization', `Bearer ${userToken}`);

    expect(res.status).toBe(200);
    expect(res.body.kyc_status).toBe('pending');
    expect(res.body.message).toBe('No KYC verification initiated');
  });
});
