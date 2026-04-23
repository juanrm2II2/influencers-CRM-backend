import { Request, Response, NextFunction } from 'express';
import { authorize } from '../../../src/middleware/authorize';

function mockReq(role?: string): Partial<Request> {
  return {
    user: role ? { sub: 'user-123', role } : undefined,
  } as Partial<Request>;
}

function mockRes(): Partial<Response> {
  const res: Partial<Response> = {};
  res.status = jest.fn().mockReturnValue(res);
  res.json = jest.fn().mockReturnValue(res);
  return res;
}

describe('authorize middleware', () => {
  let next: NextFunction;

  beforeEach(() => {
    next = jest.fn();
  });

  it('should return 403 when req.user is not set', () => {
    const middleware = authorize('admin');
    const req = { user: undefined } as Request;
    const res = mockRes() as Response;

    middleware(req, res, next);

    expect(res.status).toHaveBeenCalledWith(403);
    expect(res.json).toHaveBeenCalledWith({ error: 'Insufficient permissions' });
    expect(next).not.toHaveBeenCalled();
  });

  it('should return 403 when user role is not in allowed roles', () => {
    const middleware = authorize('admin');
    const req = mockReq('user') as Request;
    const res = mockRes() as Response;

    middleware(req, res, next);

    expect(res.status).toHaveBeenCalledWith(403);
    expect(res.json).toHaveBeenCalledWith({ error: 'Insufficient permissions' });
    expect(next).not.toHaveBeenCalled();
  });

  it('should call next() when user role matches allowed role', () => {
    const middleware = authorize('admin');
    const req = mockReq('admin') as Request;
    const res = mockRes() as Response;

    middleware(req, res, next);

    expect(next).toHaveBeenCalled();
    expect(res.status).not.toHaveBeenCalled();
  });

  it('should allow access when user has one of multiple allowed roles', () => {
    const middleware = authorize('admin', 'moderator');
    const req = mockReq('moderator') as Request;
    const res = mockRes() as Response;

    middleware(req, res, next);

    expect(next).toHaveBeenCalled();
  });

  it('should return 403 when user role is undefined', () => {
    const middleware = authorize('admin');
    const req = {
      user: { sub: 'user-123' },
    } as Request;
    const res = mockRes() as Response;

    middleware(req, res, next);

    expect(res.status).toHaveBeenCalledWith(403);
    expect(next).not.toHaveBeenCalled();
  });

  it('should return 403 when user role is empty string', () => {
    const middleware = authorize('admin');
    const req = mockReq('') as Request;
    const res = mockRes() as Response;

    middleware(req, res, next);

    expect(res.status).toHaveBeenCalledWith(403);
    expect(next).not.toHaveBeenCalled();
  });
});
