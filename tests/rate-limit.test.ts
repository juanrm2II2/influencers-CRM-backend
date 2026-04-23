import rateLimit from '../src/middleware/rate-limit';
import { Request, Response, NextFunction } from 'express';

jest.mock('express-rate-limit', () => {
  return jest.fn(() => (req: any, res: any, next: any) => next());
});

describe('rate-limit middleware', () => {
  const next: NextFunction = jest.fn();

  const mockReq = () => ({ ip: '127.0.0.1' } as unknown as Request);

  const mockRes = () => {
    const res = {} as Response;
    res.status = jest.fn().mockReturnValue(res);
    res.json = jest.fn().mockReturnValue(res);
    return res;
  };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('initializes rate limiter without throwing', () => {
    const middleware = rateLimit();
    const req = mockReq();
    const res = mockRes();

    expect(() => middleware(req, res, next)).not.toThrow();
    expect(next).toHaveBeenCalled();
  });

  it('handles rate limit exceeded scenario', () => {
    // Simulate express-rate-limit calling the handler
    const handler = rateLimit().handler;

    const req = mockReq();
    const res = mockRes();

    handler(req, res);

    expect(res.status).toHaveBeenCalledWith(429);
    expect(res.json).toHaveBeenCalled();
  });
});
