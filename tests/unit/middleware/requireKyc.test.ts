import { Request, Response, NextFunction } from 'express';

// Mock kyc service before importing middleware
const mockGetKycByUserId = jest.fn();

jest.mock('../../../src/services/kyc', () => ({
  getKycByUserId: mockGetKycByUserId,
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

import { requireKyc } from '../../../src/middleware/requireKyc';

function mockReq(user?: { sub: string; role?: string }): Partial<Request> {
  return { user: user as any };
}

function mockRes(): Partial<Response> {
  const res: Partial<Response> = {};
  res.status = jest.fn().mockReturnValue(res);
  res.json = jest.fn().mockReturnValue(res);
  return res;
}

describe('requireKyc middleware', () => {
  let next: NextFunction;

  beforeEach(() => {
    jest.clearAllMocks();
    next = jest.fn();
  });

  it('should return 401 if user is not authenticated', async () => {
    const req = mockReq() as Request;
    const res = mockRes() as Response;

    await requireKyc(req, res, next);

    expect(res.status).toHaveBeenCalledWith(401);
    expect(res.json).toHaveBeenCalledWith({ error: 'Authentication required' });
    expect(next).not.toHaveBeenCalled();
  });

  it('should return 403 if no KYC record exists', async () => {
    const req = mockReq({ sub: 'user-1' }) as Request;
    const res = mockRes() as Response;
    mockGetKycByUserId.mockResolvedValue(null);

    await requireKyc(req, res, next);

    expect(res.status).toHaveBeenCalledWith(403);
    expect(res.json).toHaveBeenCalledWith({
      error: 'KYC verification required',
      kyc_status: 'pending',
    });
    expect(next).not.toHaveBeenCalled();
  });

  it('should return 403 if KYC status is pending', async () => {
    const req = mockReq({ sub: 'user-1' }) as Request;
    const res = mockRes() as Response;
    mockGetKycByUserId.mockResolvedValue({ kyc_status: 'pending' });

    await requireKyc(req, res, next);

    expect(res.status).toHaveBeenCalledWith(403);
    expect(res.json).toHaveBeenCalledWith({
      error: 'KYC verification required',
      kyc_status: 'pending',
    });
    expect(next).not.toHaveBeenCalled();
  });

  it('should return 403 if KYC status is rejected', async () => {
    const req = mockReq({ sub: 'user-1' }) as Request;
    const res = mockRes() as Response;
    mockGetKycByUserId.mockResolvedValue({ kyc_status: 'rejected' });

    await requireKyc(req, res, next);

    expect(res.status).toHaveBeenCalledWith(403);
    expect(res.json).toHaveBeenCalledWith({
      error: 'KYC verification required',
      kyc_status: 'rejected',
    });
    expect(next).not.toHaveBeenCalled();
  });

  it('should call next() if KYC status is verified', async () => {
    const req = mockReq({ sub: 'user-1' }) as Request;
    const res = mockRes() as Response;
    mockGetKycByUserId.mockResolvedValue({ kyc_status: 'verified' });

    await requireKyc(req, res, next);

    expect(next).toHaveBeenCalled();
    expect(res.status).not.toHaveBeenCalled();
  });

  it('should return 500 (fail closed) if DB throws', async () => {
    const req = mockReq({ sub: 'user-1' }) as Request;
    const res = mockRes() as Response;
    mockGetKycByUserId.mockRejectedValue(new Error('DB error'));

    await requireKyc(req, res, next);

    expect(res.status).toHaveBeenCalledWith(500);
    expect(res.json).toHaveBeenCalledWith({ error: 'Unable to verify KYC status' });
    expect(next).not.toHaveBeenCalled();
  });
});
