import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { authenticate } from '../../../src/middleware/auth';

// Mock the tokenBlocklist service to avoid real Supabase calls
jest.mock('../../../src/services/tokenBlocklist', () => {
  const isRevokedMock = jest.fn().mockResolvedValue(false);
  return {
    tokenBlocklist: {
      isRevoked: isRevokedMock,
      revoke: jest.fn().mockResolvedValue(undefined),
      destroy: jest.fn(),
    },
  };
});

import { tokenBlocklist } from '../../../src/services/tokenBlocklist';

const JWT_SECRET = process.env.SUPABASE_JWT_SECRET!;

function mockReq(authHeader?: string): Partial<Request> {
  return { headers: authHeader ? { authorization: authHeader } : {} };
}

function mockRes(): Partial<Response> {
  const res: Partial<Response> = {};
  res.status = jest.fn().mockReturnValue(res);
  res.json = jest.fn().mockReturnValue(res);
  return res;
}

describe('authenticate middleware', () => {
  let next: NextFunction;

  beforeEach(() => {
    next = jest.fn();
    jest.clearAllMocks();
    (tokenBlocklist.isRevoked as jest.Mock).mockResolvedValue(false);
  });

  it('should return 401 when Authorization header is missing', async () => {
    const req = mockReq() as Request;
    const res = mockRes() as Response;

    await authenticate(req, res, next);

    expect(res.status).toHaveBeenCalledWith(401);
    expect(res.json).toHaveBeenCalledWith({
      error: 'Missing or malformed Authorization header',
    });
    expect(next).not.toHaveBeenCalled();
  });

  it('should return 401 when Authorization header does not start with Bearer', async () => {
    const req = mockReq('Basic some-token') as Request;
    const res = mockRes() as Response;

    await authenticate(req, res, next);

    expect(res.status).toHaveBeenCalledWith(401);
    expect(res.json).toHaveBeenCalledWith({
      error: 'Missing or malformed Authorization header',
    });
    expect(next).not.toHaveBeenCalled();
  });

  it('should return 401 when token is invalid', async () => {
    const req = mockReq('Bearer invalid-token') as Request;
    const res = mockRes() as Response;

    await authenticate(req, res, next);

    expect(res.status).toHaveBeenCalledWith(401);
    expect(res.json).toHaveBeenCalledWith({
      error: 'Invalid or expired token',
    });
    expect(next).not.toHaveBeenCalled();
  });

  it('should return 401 when token is expired', async () => {
    const expiredToken = jwt.sign(
      { sub: 'user-123', email: 'test@test.com', role: 'user' },
      JWT_SECRET,
      { algorithm: 'HS256', expiresIn: '-1s' }
    );
    const req = mockReq(`Bearer ${expiredToken}`) as Request;
    const res = mockRes() as Response;

    await authenticate(req, res, next);

    expect(res.status).toHaveBeenCalledWith(401);
    expect(res.json).toHaveBeenCalledWith({
      error: 'Invalid or expired token',
    });
    expect(next).not.toHaveBeenCalled();
  });

  it('should return 401 when token is signed with wrong secret', async () => {
    const wrongToken = jwt.sign(
      { sub: 'user-123', email: 'test@test.com', role: 'user' },
      'wrong-secret',
      { algorithm: 'HS256' }
    );
    const req = mockReq(`Bearer ${wrongToken}`) as Request;
    const res = mockRes() as Response;

    await authenticate(req, res, next);

    expect(res.status).toHaveBeenCalledWith(401);
    expect(res.json).toHaveBeenCalledWith({
      error: 'Invalid or expired token',
    });
    expect(next).not.toHaveBeenCalled();
  });

  it('should call next() and set req.user when token is valid', async () => {
    const payload = { sub: 'user-123', email: 'test@test.com', role: 'user' };
    const validToken = jwt.sign(payload, JWT_SECRET, { algorithm: 'HS256' });
    const req = mockReq(`Bearer ${validToken}`) as Request;
    const res = mockRes() as Response;

    await authenticate(req, res, next);

    expect(next).toHaveBeenCalled();
    expect(req.user).toBeDefined();
    expect(req.user?.sub).toBe('user-123');
    expect(req.user?.email).toBe('test@test.com');
    expect(req.user?.role).toBe('user');
  });

  it('should return 401 when token uses wrong algorithm', async () => {
    // HS384 instead of HS256
    const wrongAlgoToken = jwt.sign(
      { sub: 'user-123' },
      JWT_SECRET,
      { algorithm: 'HS384' }
    );
    const req = mockReq(`Bearer ${wrongAlgoToken}`) as Request;
    const res = mockRes() as Response;

    await authenticate(req, res, next);

    expect(res.status).toHaveBeenCalledWith(401);
    expect(next).not.toHaveBeenCalled();
  });

  it('should return 401 when Authorization header is "Bearer " with empty token', async () => {
    const req = mockReq('Bearer ') as Request;
    const res = mockRes() as Response;

    await authenticate(req, res, next);

    expect(res.status).toHaveBeenCalledWith(401);
    expect(next).not.toHaveBeenCalled();
  });

  it('should return 401 when token has been revoked', async () => {
    (tokenBlocklist.isRevoked as jest.Mock).mockResolvedValue(true);

    const payload = { sub: 'user-123', email: 'test@test.com', role: 'user' };
    const validToken = jwt.sign(payload, JWT_SECRET, { algorithm: 'HS256' });
    const req = mockReq(`Bearer ${validToken}`) as Request;
    const res = mockRes() as Response;

    await authenticate(req, res, next);

    expect(tokenBlocklist.isRevoked).toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(401);
    expect(res.json).toHaveBeenCalledWith({ error: 'Token has been revoked' });
    expect(next).not.toHaveBeenCalled();
  });

  it('should use JTI as the blocklist key when present', async () => {
    const payload = { sub: 'user-123', email: 'test@test.com', role: 'user', jti: 'unique-jti-id' };
    const validToken = jwt.sign(payload, JWT_SECRET, { algorithm: 'HS256' });
    const req = mockReq(`Bearer ${validToken}`) as Request;
    const res = mockRes() as Response;

    await authenticate(req, res, next);

    expect(tokenBlocklist.isRevoked).toHaveBeenCalledWith('unique-jti-id');
    expect(next).toHaveBeenCalled();
  });
});
