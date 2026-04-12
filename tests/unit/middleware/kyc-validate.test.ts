import { Request, Response, NextFunction } from 'express';
import {
  validateKycVerify,
  validateUserIdParam,
} from '../../../src/middleware/validate';

function mockReq(body?: Record<string, unknown>, params?: Record<string, string>): Partial<Request> {
  return { body, params: params as any };
}

function mockRes(): Partial<Response> {
  const res: Partial<Response> = {};
  res.status = jest.fn().mockReturnValue(res);
  res.json = jest.fn().mockReturnValue(res);
  return res;
}

describe('validateKycVerify', () => {
  let next: NextFunction;

  beforeEach(() => {
    next = jest.fn();
  });

  it('should reject missing country', () => {
    const req = mockReq({ id_doc_type: 'PASSPORT' }) as Request;
    const res = mockRes() as Response;

    validateKycVerify(req, res, next);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(next).not.toHaveBeenCalled();
  });

  it('should reject lowercase country code', () => {
    const req = mockReq({ country: 'usa', id_doc_type: 'PASSPORT' }) as Request;
    const res = mockRes() as Response;

    validateKycVerify(req, res, next);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(next).not.toHaveBeenCalled();
  });

  it('should reject 2-letter country code', () => {
    const req = mockReq({ country: 'US', id_doc_type: 'PASSPORT' }) as Request;
    const res = mockRes() as Response;

    validateKycVerify(req, res, next);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(next).not.toHaveBeenCalled();
  });

  it('should reject missing id_doc_type', () => {
    const req = mockReq({ country: 'USA' }) as Request;
    const res = mockRes() as Response;

    validateKycVerify(req, res, next);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(next).not.toHaveBeenCalled();
  });

  it('should reject invalid id_doc_type', () => {
    const req = mockReq({ country: 'USA', id_doc_type: 'BIRTH_CERT' }) as Request;
    const res = mockRes() as Response;

    validateKycVerify(req, res, next);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(next).not.toHaveBeenCalled();
  });

  it('should accept valid inputs (PASSPORT)', () => {
    const req = mockReq({ country: 'USA', id_doc_type: 'PASSPORT' }) as Request;
    const res = mockRes() as Response;

    validateKycVerify(req, res, next);

    expect(next).toHaveBeenCalled();
    expect(res.status).not.toHaveBeenCalled();
  });

  it('should accept valid inputs (ID_CARD)', () => {
    const req = mockReq({ country: 'GBR', id_doc_type: 'ID_CARD' }) as Request;
    const res = mockRes() as Response;

    validateKycVerify(req, res, next);

    expect(next).toHaveBeenCalled();
  });

  it('should accept valid inputs (DRIVERS)', () => {
    const req = mockReq({ country: 'DEU', id_doc_type: 'DRIVERS' }) as Request;
    const res = mockRes() as Response;

    validateKycVerify(req, res, next);

    expect(next).toHaveBeenCalled();
  });

  it('should accept valid inputs (RESIDENCE_PERMIT)', () => {
    const req = mockReq({ country: 'FRA', id_doc_type: 'RESIDENCE_PERMIT' }) as Request;
    const res = mockRes() as Response;

    validateKycVerify(req, res, next);

    expect(next).toHaveBeenCalled();
  });
});

describe('validateUserIdParam', () => {
  let next: NextFunction;

  beforeEach(() => {
    next = jest.fn();
  });

  it('should reject empty userId', () => {
    const req = mockReq(undefined, { userId: '' }) as Request;
    const res = mockRes() as Response;

    validateUserIdParam(req, res, next);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(next).not.toHaveBeenCalled();
  });

  it('should accept valid userId', () => {
    const req = mockReq(undefined, { userId: 'user-123' }) as Request;
    const res = mockRes() as Response;

    validateUserIdParam(req, res, next);

    expect(next).toHaveBeenCalled();
    expect(res.status).not.toHaveBeenCalled();
  });

  it('should reject overly long userId', () => {
    const req = mockReq(undefined, { userId: 'a'.repeat(256) }) as Request;
    const res = mockRes() as Response;

    validateUserIdParam(req, res, next);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(next).not.toHaveBeenCalled();
  });
});
