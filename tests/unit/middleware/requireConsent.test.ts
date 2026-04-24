import { Request, Response, NextFunction } from 'express';

const mockMaybeSingle = jest.fn();
const mockEq = jest.fn();
const mockSelect = jest.fn();
const mockFrom = jest.fn();

jest.mock('../../../src/services/supabase', () => ({
  supabase: { from: mockFrom },
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

import { requireConsent } from '../../../src/middleware/requireConsent';

function mockReq(sub?: string): Partial<Request> {
  // Build a Request-like object that exposes the scopedClient that
  // requireConsent now reads (audit H1).
  return {
    user: sub ? { sub } : undefined,
    scopedClient: sub ? ({ from: mockFrom } as unknown as Request['scopedClient']) : undefined,
  } as Partial<Request>;
}

function mockRes(): Partial<Response> {
  const res: Partial<Response> = {};
  res.status = jest.fn().mockReturnValue(res);
  res.json = jest.fn().mockReturnValue(res);
  return res;
}

function setupChain() {
  mockFrom.mockReturnValue({ select: mockSelect });
  mockSelect.mockReturnValue({ eq: mockEq });
  // First eq returns an object with another eq
  mockEq.mockReturnValueOnce({ eq: mockEq });
  // Second eq returns an object with maybeSingle
  mockEq.mockReturnValueOnce({ maybeSingle: mockMaybeSingle });
}

describe('requireConsent middleware', () => {
  let next: NextFunction;

  beforeEach(() => {
    jest.clearAllMocks();
    next = jest.fn();
  });

  it('should return 401 when req.user is not set', async () => {
    const req = mockReq() as Request;
    const res = mockRes() as Response;

    await requireConsent(req, res, next);

    expect(res.status).toHaveBeenCalledWith(401);
    expect(res.json).toHaveBeenCalledWith({ error: 'Authentication required' });
    expect(next).not.toHaveBeenCalled();
  });

  it('should return 403 when no consent record exists', async () => {
    setupChain();
    mockMaybeSingle.mockResolvedValueOnce({ data: null, error: null });

    const req = mockReq('user-1') as Request;
    const res = mockRes() as Response;

    await requireConsent(req, res, next);

    expect(res.status).toHaveBeenCalledWith(403);
    expect(res.json).toHaveBeenCalledWith({ error: 'Data processing consent is required' });
    expect(next).not.toHaveBeenCalled();
  });

  it('should return 403 when consent is revoked (granted=false)', async () => {
    setupChain();
    mockMaybeSingle.mockResolvedValueOnce({ data: { granted: false }, error: null });

    const req = mockReq('user-1') as Request;
    const res = mockRes() as Response;

    await requireConsent(req, res, next);

    expect(res.status).toHaveBeenCalledWith(403);
    expect(res.json).toHaveBeenCalledWith({ error: 'Data processing consent is required' });
    expect(next).not.toHaveBeenCalled();
  });

  it('should call next() when consent is granted', async () => {
    setupChain();
    mockMaybeSingle.mockResolvedValueOnce({ data: { granted: true }, error: null });

    const req = mockReq('user-1') as Request;
    const res = mockRes() as Response;

    await requireConsent(req, res, next);

    expect(next).toHaveBeenCalled();
    expect(res.status).not.toHaveBeenCalled();
  });

  it('should query the correct table and consent type', async () => {
    setupChain();
    mockMaybeSingle.mockResolvedValueOnce({ data: { granted: true }, error: null });

    const req = mockReq('user-42') as Request;
    const res = mockRes() as Response;

    await requireConsent(req, res, next);

    expect(mockFrom).toHaveBeenCalledWith('consent');
    expect(mockSelect).toHaveBeenCalledWith('granted');
    expect(mockEq).toHaveBeenCalledWith('user_id', 'user-42');
    expect(mockEq).toHaveBeenCalledWith('consent_type', 'data_processing');
  });

  it('should return 500 when supabase returns an error', async () => {
    setupChain();
    mockMaybeSingle.mockResolvedValueOnce({ data: null, error: { message: 'DB error' } });

    const req = mockReq('user-1') as Request;
    const res = mockRes() as Response;

    await requireConsent(req, res, next);

    expect(res.status).toHaveBeenCalledWith(500);
    expect(res.json).toHaveBeenCalledWith({ error: 'Internal server error' });
    expect(next).not.toHaveBeenCalled();
  });

  it('should return 500 when an unexpected error is thrown', async () => {
    mockFrom.mockImplementationOnce(() => {
      throw new Error('Unexpected');
    });

    const req = mockReq('user-1') as Request;
    const res = mockRes() as Response;

    await requireConsent(req, res, next);

    expect(res.status).toHaveBeenCalledWith(500);
    expect(res.json).toHaveBeenCalledWith({ error: 'Internal server error' });
    expect(next).not.toHaveBeenCalled();
  });
});
