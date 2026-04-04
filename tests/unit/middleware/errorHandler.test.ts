import { Request, Response, NextFunction } from 'express';

jest.mock('../../../src/logger', () => ({
  logger: {
    info: jest.fn(),
    error: jest.fn(),
    warn: jest.fn(),
    debug: jest.fn(),
    fatal: jest.fn(),
  },
}));

import { errorHandler } from '../../../src/middleware/errorHandler';
import { logger } from '../../../src/logger';

function mockRes(): Partial<Response> {
  const res: Partial<Response> = {};
  res.status = jest.fn().mockReturnValue(res);
  res.json = jest.fn().mockReturnValue(res);
  return res;
}

describe('errorHandler middleware', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('should return 500 with generic error message', () => {
    const err = new Error('Something went wrong');
    const req = {} as Request;
    const res = mockRes() as Response;
    const next = jest.fn() as NextFunction;

    errorHandler(err, req, res, next);

    expect(res.status).toHaveBeenCalledWith(500);
    expect(res.json).toHaveBeenCalledWith({ error: 'Internal server error' });
  });

  it('should log the full error server-side', () => {
    const err = new Error('Database connection failed');
    const req = {} as Request;
    const res = mockRes() as Response;
    const next = jest.fn() as NextFunction;

    errorHandler(err, req, res, next);

    expect(logger.error).toHaveBeenCalledWith({ err }, 'Unhandled error');
  });

  it('should not expose error details to the client', () => {
    const err = new Error('Sensitive internal error: password=secret123');
    const req = {} as Request;
    const res = mockRes() as Response;
    const next = jest.fn() as NextFunction;

    errorHandler(err, req, res, next);

    const jsonCall = (res.json as jest.Mock).mock.calls[0][0];
    expect(jsonCall.error).toBe('Internal server error');
    expect(JSON.stringify(jsonCall)).not.toContain('secret123');
    expect(JSON.stringify(jsonCall)).not.toContain('password');
  });

  it('should handle non-Error objects', () => {
    const err = 'String error' as unknown as Error;
    const req = {} as Request;
    const res = mockRes() as Response;
    const next = jest.fn() as NextFunction;

    errorHandler(err, req, res, next);

    expect(res.status).toHaveBeenCalledWith(500);
    expect(res.json).toHaveBeenCalledWith({ error: 'Internal server error' });
  });
});
