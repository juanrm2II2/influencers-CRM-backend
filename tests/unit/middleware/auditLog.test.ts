import { Request, Response, NextFunction } from 'express';

// Mock supabase before importing the module under test
const mockFrom = jest.fn();
const mockSelect = jest.fn();
const mockEq = jest.fn();
const mockMaybeSingle = jest.fn();

function setupChain() {
  const chain: Record<string, jest.Mock> = {
    select: mockSelect,
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

jest.mock('../../../src/services/supabase', () => ({
  supabase: { from: mockFrom },
}));

const mockRecordAuditLog = jest.fn().mockResolvedValue(undefined);
jest.mock('../../../src/services/auditLog', () => ({
  recordAuditLog: mockRecordAuditLog,
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

import { auditLog } from '../../../src/middleware/auditLog';

describe('auditLog middleware — before-state capture', () => {
  let mockReq: Partial<Request>;
  let mockRes: Partial<Response>;
  let next: NextFunction;

  beforeEach(() => {
    jest.clearAllMocks();
    setupChain();

    mockReq = {
      method: 'PATCH',
      originalUrl: '/api/influencers/abc-123',
      baseUrl: '/api/influencers',
      path: '/abc-123',
      params: { id: 'abc-123' },
      body: { status: 'active' },
      ip: '127.0.0.1',
      user: { sub: 'user-1', email: 'test@test.com', iat: 0 },
      // The middleware now reads its DB client from req.scopedClient
      // (audit H1) so the before-state fetch is RLS-scoped.
      scopedClient: { from: mockFrom } as unknown as Request['scopedClient'],
    };

    const jsonFn = jest.fn().mockReturnThis();
    mockRes = {
      json: jsonFn,
    };

    next = jest.fn();
  });

  it('should fetch before-state for PATCH requests and include it in the audit log', async () => {
    const existingRecord = { id: 'abc-123', status: 'prospect', niche: 'tech' };
    mockMaybeSingle.mockResolvedValue({ data: existingRecord, error: null });

    auditLog(mockReq as Request, mockRes as Response, next);

    // Wait for the async before-state fetch
    await new Promise((resolve) => setTimeout(resolve, 50));

    expect(next).toHaveBeenCalled();

    // Trigger res.json to fire the audit log
    (mockRes.json as jest.Mock)({}); 

    // Wait for fire-and-forget
    await new Promise((resolve) => setTimeout(resolve, 50));

    expect(mockRecordAuditLog).toHaveBeenCalledWith(
      expect.objectContaining({
        before_state: existingRecord,
        after_state: { status: 'active' },
        actor_id: 'user-1',
      })
    );
  });

  it('should not include before_state for POST requests without :id', async () => {
    mockReq.method = 'POST';
    mockReq.params = {};
    mockReq.originalUrl = '/api/influencers/search';
    mockReq.body = { handle: 'test', platform: 'tiktok' };

    auditLog(mockReq as Request, mockRes as Response, next);

    await new Promise((resolve) => setTimeout(resolve, 50));

    expect(next).toHaveBeenCalled();

    (mockRes.json as jest.Mock)({});

    await new Promise((resolve) => setTimeout(resolve, 50));

    expect(mockRecordAuditLog).toHaveBeenCalledWith(
      expect.objectContaining({
        before_state: undefined,
      })
    );
  });

  it('should include before_state for DELETE requests', async () => {
    mockReq.method = 'DELETE';
    const existingRecord = { id: 'abc-123', status: 'prospect' };
    mockMaybeSingle.mockResolvedValue({ data: existingRecord, error: null });

    auditLog(mockReq as Request, mockRes as Response, next);

    await new Promise((resolve) => setTimeout(resolve, 50));

    expect(next).toHaveBeenCalled();

    (mockRes.json as jest.Mock)({});

    await new Promise((resolve) => setTimeout(resolve, 50));

    expect(mockRecordAuditLog).toHaveBeenCalledWith(
      expect.objectContaining({
        before_state: existingRecord,
        after_state: undefined, // DELETE has no after_state
      })
    );
  });

  it('should skip non-auditable methods', () => {
    mockReq.method = 'GET';

    auditLog(mockReq as Request, mockRes as Response, next);

    expect(next).toHaveBeenCalled();
    expect(mockFrom).not.toHaveBeenCalled();
  });

  it('should continue even if before-state fetch fails', async () => {
    mockMaybeSingle.mockResolvedValue({ data: null, error: { message: 'DB error' } });

    auditLog(mockReq as Request, mockRes as Response, next);

    await new Promise((resolve) => setTimeout(resolve, 50));

    expect(next).toHaveBeenCalled();

    (mockRes.json as jest.Mock)({});

    await new Promise((resolve) => setTimeout(resolve, 50));

    // Should still record the audit log, just without before_state
    expect(mockRecordAuditLog).toHaveBeenCalledWith(
      expect.objectContaining({
        before_state: undefined,
      })
    );
  });

  it('should redact non-allow-listed fields from after_state (audit M3)', async () => {
    // Free-text PII fields (notes, message_sent, response, bio) must be
    // dropped before the audit row is written; only categorical /
    // operational fields (status, niche, channel …) survive.
    mockReq.method = 'POST';
    mockReq.params = {};
    mockReq.originalUrl = '/api/influencers/abc/outreach';
    mockReq.body = {
      channel: 'email',
      contact_date: '2026-01-01',
      message_sent: 'hello secret diary entry',
      response: 'private response with PII',
      notes: 'do not store this',
    };

    auditLog(mockReq as Request, mockRes as Response, next);
    await new Promise((resolve) => setTimeout(resolve, 50));

    (mockRes.json as jest.Mock)({});
    await new Promise((resolve) => setTimeout(resolve, 50));

    const args = mockRecordAuditLog.mock.calls[0][0];
    expect(args.after_state).toEqual({
      channel: 'email',
      contact_date: '2026-01-01',
    });
    expect(JSON.stringify(args.after_state)).not.toContain('secret diary');
    expect(JSON.stringify(args.after_state)).not.toContain('private response');
    expect(JSON.stringify(args.after_state)).not.toContain('do not store');
  });

  it('should leave after_state undefined when no allow-listed field is present (audit M3)', async () => {
    mockReq.method = 'POST';
    mockReq.params = {};
    mockReq.originalUrl = '/api/influencers/abc/outreach';
    mockReq.body = { message_sent: 'only PII here', response: 'also PII' };

    auditLog(mockReq as Request, mockRes as Response, next);
    await new Promise((resolve) => setTimeout(resolve, 50));

    (mockRes.json as jest.Mock)({});
    await new Promise((resolve) => setTimeout(resolve, 50));

    const args = mockRecordAuditLog.mock.calls[0][0];
    expect(args.after_state).toBeUndefined();
  });
});
