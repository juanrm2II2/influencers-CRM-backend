import request from 'supertest';
import { generateToken } from '../helpers';

// Mock supabase
const mockFrom = jest.fn();
const mockSelect = jest.fn();
const mockSingle = jest.fn();
const mockEq = jest.fn();
const mockMaybeSingle = jest.fn();

function setupChain() {
  const chain: Record<string, jest.Mock> = {
    select: mockSelect,
    single: mockSingle,
    eq: mockEq,
    maybeSingle: mockMaybeSingle,
    from: mockFrom,
  };
  for (const key of Object.keys(chain)) {
    chain[key].mockReturnValue(chain);
  }
  mockFrom.mockReturnValue(chain);
  return chain;
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

const mockRevoke = jest.fn().mockResolvedValue(undefined);
const mockIsRevoked = jest.fn().mockResolvedValue(false);

jest.mock('../../src/services/tokenBlocklist', () => ({
  tokenBlocklist: {
    isRevoked: mockIsRevoked,
    revoke: mockRevoke,
    destroy: jest.fn(),
  },
}));

import { createApp } from '../../src/app';

const app = createApp();

const userToken = generateToken({
  sub: 'user-1',
  email: 'user@test.com',
  role: 'user',
});

beforeEach(() => {
  jest.clearAllMocks();
  setupChain();
  mockIsRevoked.mockResolvedValue(false);
  mockRevoke.mockResolvedValue(undefined);
});

describe('POST /api/auth/logout', () => {
  it('should return 401 without auth token', async () => {
    const res = await request(app).post('/api/auth/logout');
    expect(res.status).toBe(401);
  });

  it('should return 200 and revoke the token on success', async () => {
    const res = await request(app)
      .post('/api/auth/logout')
      .set('Authorization', `Bearer ${userToken}`);

    expect(res.status).toBe(200);
    expect(res.body.message).toBe('Logged out successfully');
    expect(mockRevoke).toHaveBeenCalledTimes(1);
  });

  it('should use jti if present in token', async () => {
    const tokenWithJti = generateToken(
      { sub: 'user-1', email: 'user@test.com', role: 'user' },
      { jwtid: 'test-jti-123' }
    );

    const res = await request(app)
      .post('/api/auth/logout')
      .set('Authorization', `Bearer ${tokenWithJti}`);

    expect(res.status).toBe(200);
    expect(mockRevoke).toHaveBeenCalledWith('test-jti-123', expect.any(Number));
  });

  it('should return 500 when revocation fails', async () => {
    mockRevoke.mockRejectedValue(new Error('DB error'));

    const res = await request(app)
      .post('/api/auth/logout')
      .set('Authorization', `Bearer ${userToken}`);

    expect(res.status).toBe(500);
    expect(res.body.error).toBe('Internal server error');
  });

  it('should reject a revoked token on subsequent requests', async () => {
    // Simulate the token being revoked
    mockIsRevoked.mockResolvedValue(true);

    const res = await request(app)
      .post('/api/auth/logout')
      .set('Authorization', `Bearer ${userToken}`);

    expect(res.status).toBe(401);
    expect(res.body.error).toBe('Token has been revoked');
  });
});

describe('Request-ID integration', () => {
  it('should return X-Request-Id header on responses', async () => {
    const res = await request(app).get('/health');

    expect(res.headers['x-request-id']).toBeDefined();
    expect(res.headers['x-request-id']).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
    );
  });

  it('should echo back a valid X-Request-Id from the client', async () => {
    const clientId = '550e8400-e29b-41d4-a716-446655440000';
    const res = await request(app)
      .get('/health')
      .set('X-Request-Id', clientId);

    expect(res.headers['x-request-id']).toBe(clientId);
  });

  it('should generate a new ID when client sends invalid X-Request-Id', async () => {
    const res = await request(app)
      .get('/health')
      .set('X-Request-Id', 'invalid-id');

    expect(res.headers['x-request-id']).not.toBe('invalid-id');
    expect(res.headers['x-request-id']).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
    );
  });
});
