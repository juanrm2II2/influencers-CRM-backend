import { validate } from '../src/middleware/validate';
import { Request, Response, NextFunction } from 'express';

describe('validate middleware (deep coverage)', () => {
  const next: NextFunction = jest.fn();

  const mockRes = () => {
    const res = {} as Response;
    res.status = jest.fn().mockReturnValue(res);
    res.json = jest.fn().mockReturnValue(res);
    return res;
  };

  const mockReq = (body: any = {}) =>
    ({ body } as unknown as Request);

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('passes through when schema parses successfully', () => {
    const schema = {
      parse: jest.fn().mockReturnValue({ ok: true })
    };

    const req = mockReq({ name: 'Juan' });
    const res = mockRes();

    validate(schema)(req, res, next);

    expect(schema.parse).toHaveBeenCalledWith({ name: 'Juan' });
    expect(req.body).toEqual({ ok: true });
    expect(next).toHaveBeenCalled();
  });

  it('returns 400 when schema throws a generic error', () => {
    const schema = {
      parse: jest.fn(() => {
        throw new Error('Invalid');
      })
    };

    const req = mockReq({ bad: true });
    const res = mockRes();

    validate(schema)(req, res, next);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        message: 'Invalid'
      })
    );
  });

  it('returns 400 when schema throws a Zod-like error with issues', () => {
    const schema = {
      parse: jest.fn(() => {
        const err = new Error('Validation failed');
        (err as any).issues = [{ path: ['email'], message: 'Invalid email' }];
        throw err;
      })
    };

    const req = mockReq({ email: 'bad' });
    const res = mockRes();

    validate(schema)(req, res, next);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        message: 'Validation failed',
        issues: [{ path: ['email'], message: 'Invalid email' }]
      })
    );
  });

  it('handles empty request body gracefully', () => {
    const schema = {
      parse: jest.fn().mockReturnValue({ ok: true })
    };

    const req = mockReq(undefined as any);
    const res = mockRes();

    validate(schema)(req, res, next);

    expect(schema.parse).toHaveBeenCalledWith(undefined);
    expect(next).toHaveBeenCalled();
  });
});
