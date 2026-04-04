import request from 'supertest';
import jwt from 'jsonwebtoken';
import { generateToken, TEST_UUID } from '../helpers';

// Mock supabase and scrapeCreators
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
  mockFrom.mockReturnValue(chain);
  return chain;
}

setupChain();

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

import { createApp } from '../../src/app';

const app = createApp();

const JWT_SECRET = process.env.SUPABASE_JWT_SECRET!;
const userToken = generateToken({ sub: 'user-1', email: 'user@test.com', role: 'user' });

beforeEach(() => {
  jest.clearAllMocks();
  setupChain();
  jest.spyOn(console, 'error').mockImplementation();
  jest.spyOn(console, 'log').mockImplementation();
});

afterEach(() => {
  (console.error as jest.Mock).mockRestore?.();
  (console.log as jest.Mock).mockRestore?.();
});

describe('Authentication Bypass Tests', () => {
  it('should reject requests without any Authorization header', async () => {
    const res = await request(app).get('/api/influencers');
    expect(res.status).toBe(401);
  });

  it('should reject requests with empty Authorization header', async () => {
    const res = await request(app)
      .get('/api/influencers')
      .set('Authorization', '');
    expect(res.status).toBe(401);
  });

  it('should reject requests with only "Bearer" (no token)', async () => {
    const res = await request(app)
      .get('/api/influencers')
      .set('Authorization', 'Bearer');
    expect(res.status).toBe(401);
  });

  it('should reject requests with "Bearer " and empty token', async () => {
    const res = await request(app)
      .get('/api/influencers')
      .set('Authorization', 'Bearer ');
    expect(res.status).toBe(401);
  });

  it('should reject requests with Basic auth scheme', async () => {
    const res = await request(app)
      .get('/api/influencers')
      .set('Authorization', 'Basic dXNlcjpwYXNz');
    expect(res.status).toBe(401);
  });

  it('should reject tokens signed with a different secret', async () => {
    const fakeToken = jwt.sign(
      { sub: 'hacker', role: 'admin' },
      'completely-different-secret',
      { algorithm: 'HS256' }
    );
    const res = await request(app)
      .get('/api/influencers')
      .set('Authorization', `Bearer ${fakeToken}`);
    expect(res.status).toBe(401);
  });

  it('should reject expired tokens', async () => {
    const expiredToken = jwt.sign(
      { sub: 'user-1', role: 'user' },
      JWT_SECRET,
      { algorithm: 'HS256', expiresIn: '-1s' }
    );
    const res = await request(app)
      .get('/api/influencers')
      .set('Authorization', `Bearer ${expiredToken}`);
    expect(res.status).toBe(401);
  });

  it('should reject tokens with wrong algorithm (HS384)', async () => {
    const wrongAlgoToken = jwt.sign(
      { sub: 'user-1', role: 'admin' },
      JWT_SECRET,
      { algorithm: 'HS384' }
    );
    const res = await request(app)
      .get('/api/influencers')
      .set('Authorization', `Bearer ${wrongAlgoToken}`);
    expect(res.status).toBe(401);
  });

  it('should reject malformed JWT tokens', async () => {
    const res = await request(app)
      .get('/api/influencers')
      .set('Authorization', 'Bearer not.a.valid.jwt.token');
    expect(res.status).toBe(401);
  });

  it('should reject tokens with tampered payload', async () => {
    // Create a valid token, then tamper with the payload
    const validToken = jwt.sign(
      { sub: 'user-1', role: 'user' },
      JWT_SECRET,
      { algorithm: 'HS256' }
    );
    const parts = validToken.split('.');
    // Tamper with payload to escalate to admin
    const tamperedPayload = Buffer.from(
      JSON.stringify({ sub: 'user-1', role: 'admin', iat: Math.floor(Date.now() / 1000) })
    ).toString('base64url');
    const tamperedToken = `${parts[0]}.${tamperedPayload}.${parts[2]}`;

    const res = await request(app)
      .get('/api/influencers')
      .set('Authorization', `Bearer ${tamperedToken}`);
    expect(res.status).toBe(401);
  });
});

describe('Authorization Bypass Tests', () => {
  it('should prevent non-admin from deleting influencers', async () => {
    const res = await request(app)
      .delete(`/api/influencers/${TEST_UUID}`)
      .set('Authorization', `Bearer ${userToken}`);
    expect(res.status).toBe(403);
  });

  it('should prevent user with no role from deleting', async () => {
    const noRoleToken = jwt.sign(
      { sub: 'user-1', email: 'user@test.com' },
      JWT_SECRET,
      { algorithm: 'HS256' }
    );
    const res = await request(app)
      .delete(`/api/influencers/${TEST_UUID}`)
      .set('Authorization', `Bearer ${noRoleToken}`);
    expect(res.status).toBe(403);
  });

  it('should prevent role escalation via case manipulation', async () => {
    const upperCaseToken = generateToken({ sub: 'user-1', role: 'Admin' });
    const res = await request(app)
      .delete(`/api/influencers/${TEST_UUID}`)
      .set('Authorization', `Bearer ${upperCaseToken}`);
    expect(res.status).toBe(403);
  });

  it('should prevent role escalation via whitespace padding', async () => {
    const paddedToken = generateToken({ sub: 'user-1', role: ' admin ' });
    const res = await request(app)
      .delete(`/api/influencers/${TEST_UUID}`)
      .set('Authorization', `Bearer ${paddedToken}`);
    expect(res.status).toBe(403);
  });
});

describe('SQL Injection Tests', () => {
  it('should reject SQL injection in :id parameter', async () => {
    const res = await request(app)
      .get("/api/influencers/'; DROP TABLE influencers;--")
      .set('Authorization', `Bearer ${userToken}`);
    expect(res.status).toBe(400);
    expect(res.body.error).toBe('id must be a valid UUID');
  });

  it('should reject SQL injection with UNION in id', async () => {
    const res = await request(app)
      .get("/api/influencers/1' UNION SELECT * FROM users--")
      .set('Authorization', `Bearer ${userToken}`);
    expect(res.status).toBe(400);
  });

  it('should reject SQL injection with OR 1=1 in id', async () => {
    const res = await request(app)
      .get("/api/influencers/' OR 1=1--")
      .set('Authorization', `Bearer ${userToken}`);
    expect(res.status).toBe(400);
  });

  it('should sanitize ILIKE wildcards in niche query param', async () => {
    const queryChain = setupChain();
    queryChain.then = jest.fn((resolve: (v: unknown) => void) => {
      resolve({ data: [], error: null });
    }) as unknown as jest.Mock;

    const res = await request(app)
      .get('/api/influencers?niche=%25admin%25')
      .set('Authorization', `Bearer ${userToken}`);

    expect(res.status).toBe(200);
    // The % in the niche value should be escaped
    expect(mockIlike).toHaveBeenCalledWith('niche', expect.stringContaining('\\%'));
  });

  it('should reject SQL injection in search handle', async () => {
    const res = await request(app)
      .post('/api/influencers/search')
      .set('Authorization', `Bearer ${userToken}`)
      .send({ handle: "'; DROP TABLE--", platform: 'tiktok' });

    // Should proceed to scrapeProfile (handle is validated as non-empty string, not SQL-checked)
    // The key security is that Supabase uses parameterized queries
    expect(res.status).not.toBe(500);
  });
});

describe('XSS / Script Injection Tests', () => {
  it('should not execute script tags in search handle', async () => {
    const res = await request(app)
      .post('/api/influencers/search')
      .set('Authorization', `Bearer ${userToken}`)
      .send({
        handle: '<script>alert("xss")</script>',
        platform: 'tiktok',
      });

    // Should not return unescaped script in response
    if (res.status === 200 || res.status === 201) {
      const body = JSON.stringify(res.body);
      expect(body).not.toContain('<script>alert');
    }
  });

  it('should handle XSS in update notes field', async () => {
    mockSingle.mockResolvedValue({
      data: { notes: '<script>alert("xss")</script>' },
      error: null,
    });

    const res = await request(app)
      .patch(`/api/influencers/${TEST_UUID}`)
      .set('Authorization', `Bearer ${userToken}`)
      .send({ notes: '<script>alert("xss")</script>' });

    // API should store the data but Content-Type should be JSON (not HTML)
    expect(res.headers['content-type']).toMatch(/json/);
  });
});

describe('Input Size / DoS Prevention Tests', () => {
  it('should reject handle exceeding max length', async () => {
    const res = await request(app)
      .post('/api/influencers/search')
      .set('Authorization', `Bearer ${userToken}`)
      .send({ handle: 'x'.repeat(201), platform: 'tiktok' });

    expect(res.status).toBe(400);
  });

  it('should reject bulk search exceeding 50 handles', async () => {
    const handles = Array.from({ length: 51 }, (_, i) => `user${i}`);
    const res = await request(app)
      .post('/api/influencers/bulk-search')
      .set('Authorization', `Bearer ${userToken}`)
      .send({ handles, platform: 'tiktok' });

    expect(res.status).toBe(400);
  });

  it('should reject notes exceeding max length', async () => {
    const res = await request(app)
      .patch(`/api/influencers/${TEST_UUID}`)
      .set('Authorization', `Bearer ${userToken}`)
      .send({ notes: 'x'.repeat(5001) });

    expect(res.status).toBe(400);
  });

  it('should reject message_sent exceeding max length in outreach', async () => {
    const res = await request(app)
      .post(`/api/influencers/${TEST_UUID}/outreach`)
      .set('Authorization', `Bearer ${userToken}`)
      .send({ message_sent: 'x'.repeat(5001) });

    expect(res.status).toBe(400);
  });
});

describe('Content-Type / Header Security Tests', () => {
  it('should include security headers from Helmet', async () => {
    const res = await request(app).get('/health');

    // Helmet sets various security headers
    expect(res.headers['x-content-type-options']).toBe('nosniff');
    expect(res.headers['x-frame-options']).toBeDefined();
  });

  it('should respond with JSON content type', async () => {
    const res = await request(app).get('/health');

    expect(res.headers['content-type']).toMatch(/json/);
  });
});

describe('Error Information Leakage Tests', () => {
  it('should not leak stack traces in error responses', async () => {
    mockSingle.mockRejectedValue(new Error('Internal database connection error'));

    const res = await request(app)
      .get(`/api/influencers/${TEST_UUID}`)
      .set('Authorization', `Bearer ${userToken}`);

    const body = JSON.stringify(res.body);
    expect(body).not.toContain('database connection');
    expect(body).not.toContain('stack');
    expect(body).not.toContain('Error:');
  });

  it('should return generic error message on 500', async () => {
    mockSingle.mockRejectedValue(new Error('Sensitive: password=abc123'));

    const res = await request(app)
      .get(`/api/influencers/${TEST_UUID}`)
      .set('Authorization', `Bearer ${userToken}`);

    if (res.status === 500) {
      expect(res.body.error).toBe('Internal server error');
      expect(JSON.stringify(res.body)).not.toContain('password');
      expect(JSON.stringify(res.body)).not.toContain('abc123');
    }
  });

  it('should not expose server technology in responses', async () => {
    const res = await request(app).get('/health');

    // X-Powered-By should be removed by Helmet
    expect(res.headers['x-powered-by']).toBeUndefined();
  });
});

describe('Path Traversal Tests', () => {
  it('should return 400/404 for path traversal in :id', async () => {
    const res = await request(app)
      .get('/api/influencers/../../etc/passwd')
      .set('Authorization', `Bearer ${userToken}`);

    // Should be rejected by UUID validation or return 404
    expect([400, 404]).toContain(res.status);
  });

  it('should return 400/404 for encoded path traversal', async () => {
    const res = await request(app)
      .get('/api/influencers/%2e%2e%2f%2e%2e%2fetc%2fpasswd')
      .set('Authorization', `Bearer ${userToken}`);

    expect([400, 404]).toContain(res.status);
  });
});
