import { Request, Response, NextFunction } from 'express';
import { requestId } from '../../../src/middleware/requestId';

describe('requestId middleware', () => {
  let mockReq: Partial<Request>;
  let mockRes: Partial<Response>;
  let next: NextFunction;

  beforeEach(() => {
    mockReq = {
      headers: {},
    };
    mockRes = {
      setHeader: jest.fn(),
    };
    next = jest.fn();
  });

  it('should generate a UUID when no X-Request-Id header is present', () => {
    requestId(mockReq as Request, mockRes as Response, next);

    expect(mockReq.requestId).toBeDefined();
    expect(mockReq.requestId).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
    );
    expect(mockRes.setHeader).toHaveBeenCalledWith('X-Request-Id', mockReq.requestId);
    expect(next).toHaveBeenCalled();
  });

  it('should reuse a valid UUID from the X-Request-Id header', () => {
    const clientId = '550e8400-e29b-41d4-a716-446655440000';
    mockReq.headers = { 'x-request-id': clientId };

    requestId(mockReq as Request, mockRes as Response, next);

    expect(mockReq.requestId).toBe(clientId);
    expect(mockRes.setHeader).toHaveBeenCalledWith('X-Request-Id', clientId);
    expect(next).toHaveBeenCalled();
  });

  it('should generate a new UUID when X-Request-Id is not a valid UUID', () => {
    mockReq.headers = { 'x-request-id': 'not-a-valid-uuid' };

    requestId(mockReq as Request, mockRes as Response, next);

    expect(mockReq.requestId).not.toBe('not-a-valid-uuid');
    expect(mockReq.requestId).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
    );
    expect(next).toHaveBeenCalled();
  });

  it('should generate a new UUID when X-Request-Id is empty', () => {
    mockReq.headers = { 'x-request-id': '' };

    requestId(mockReq as Request, mockRes as Response, next);

    expect(mockReq.requestId).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
    );
    expect(next).toHaveBeenCalled();
  });

  it('should reject potential header injection in X-Request-Id', () => {
    mockReq.headers = { 'x-request-id': '<script>alert(1)</script>' };

    requestId(mockReq as Request, mockRes as Response, next);

    expect(mockReq.requestId).not.toContain('<script>');
    expect(mockReq.requestId).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
    );
    expect(next).toHaveBeenCalled();
  });
});
