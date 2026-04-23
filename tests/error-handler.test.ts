import { errorHandler } from '../src/middleware/error-handler';
import { Request, Response, NextFunction } from 'express';

describe('error-handler middleware', () => {
  const mockReq = {} as Request;

  const mockRes = () => {
    const res = {} as Response;
    res.status = jest.fn().mockReturnValue(res);
    res.json = jest.fn().mockReturnValue(res);
    return res;
  };

  const next: NextFunction = jest.fn();

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('handles generic errors with 500 status', () => {
    const err = new Error('Something broke');
    const res = mockRes();

    errorHandler(err, mockReq, res, next);

    expect(res.status).toHaveBeenCalledWith(500);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        message: 'Something broke'
      })
    );
  });

  it('handles errors with explicit status codes', () => {
    const err = Object.assign(new Error('Bad request'), { status: 400 });
    const res = mockRes();

    errorHandler(err, mockReq, res, next);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalled();
  });

  it('handles custom error objects with code and details', () => {
    const err = {
      status: 422,
      message: 'Validation failed',
      details: { field: 'email' }
    };

    const res = mockRes();

    errorHandler(err as any, mockReq, res, next);

    expect(res.status).toHaveBeenCalledWith(422);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        message: 'Validation failed',
        details: { field: 'email' }
      })
    );
  });
});
