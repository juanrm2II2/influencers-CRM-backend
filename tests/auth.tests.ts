import { authMiddleware } from '../src/middleware/auth';
import { verifyJwt } from '../src/utils/jwt';
import { Request, Response, NextFunction } from 'express';

jest.mock('../src/utils/jwt', () => ({
  verifyJwt: jest.fn()
}));

describe('auth middleware', () => {
  const next: NextFunction = jest.fn();

  const mockRes = () => {
    const res = {} as Response;
    res.status = jest.fn().mockReturnValue(res);
    res.json = jest.fn().mockReturnValue(res);
    return res;
  };

  const mockReq = (token?: string) =>
    ({
      headers: token ? { authorization: `Bearer ${token}` } : {}
    } as unknown as Request);

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('calls next when token is valid', () => {
    (verifyJwt as jest.Mock).mockReturnValue({ userId: '123' });

    const req = mockReq('valid-token');
    const res = mockRes();

    authMiddleware(req, res, next);

    expect(verifyJwt).toHaveBeenCalledWith('valid-token');
    expect(next).toHaveBeenCalled();
  });

  it('returns 401 when no token is provided', () => {
    const req = mockReq();
    const res = mockRes();

    authMiddleware(req, res, next);

    expect(res.status).toHaveBeenCalledWith(401);
    expect(res.json).toHaveBeenCalled();
  });

  it('returns 401 when token is invalid', () => {
    (verifyJwt as jest.Mock).mockImplementation(() => {
      throw new Error('invalid');
    });

    const req = mockReq('bad-token');
    const res = mockRes();

    authMiddleware(req, res, next);

    expect(res.status).toHaveBeenCalledWith(401);
    expect(res.json).toHaveBeenCalled();
  });

  it('returns 401 when token is expired', () => {
    (verifyJwt as jest.Mock).mockImplementation(() => {
      const err = new Error('expired');
      (err as any).name = 'TokenExpiredError';
      throw err;
    });

    const req = mockReq('expired-token');
    const res = mockRes();

    authMiddleware(req, res, next);

    expect(res.status).toHaveBeenCalledWith(401);
    expect(res.json).toHaveBeenCalled();
  });
});
