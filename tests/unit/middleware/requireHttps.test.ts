import { Request, Response, NextFunction } from 'express';

// We need to control NODE_ENV per test, so store original and restore later
const ORIGINAL_NODE_ENV = process.env.NODE_ENV;

jest.mock('../../../src/logger', () => ({
  logger: {
    info: jest.fn(),
    error: jest.fn(),
    warn: jest.fn(),
    debug: jest.fn(),
    fatal: jest.fn(),
  },
}));

import { requireHttps } from '../../../src/middleware/requireHttps';

function createMockReq(overrides: Partial<Request> = {}): Request {
  return {
    protocol: 'http',
    hostname: 'example.com',
    originalUrl: '/api/test',
    headers: {},
    ...overrides,
  } as unknown as Request;
}

function createMockRes(): Response & { redirectUrl?: string; statusCode?: number } {
  const res = {
    redirect: jest.fn(function (this: Response & { redirectUrl?: string; statusCode?: number }, status: number, url: string) {
      this.statusCode = status;
      this.redirectUrl = url;
    }),
  } as unknown as Response & { redirectUrl?: string; statusCode?: number };
  return res;
}

afterEach(() => {
  process.env.NODE_ENV = ORIGINAL_NODE_ENV;
});

describe('requireHttps middleware', () => {
  // -----------------------------------------------------------------------
  // Non-production: should always pass through
  // -----------------------------------------------------------------------
  describe('non-production (development / test)', () => {
    it('should call next() without redirect when NODE_ENV is not production', () => {
      process.env.NODE_ENV = 'development';
      const req = createMockReq();
      const res = createMockRes();
      const next = jest.fn();

      requireHttps(req, res, next);

      expect(next).toHaveBeenCalled();
      expect(res.redirect).not.toHaveBeenCalled();
    });

    it('should call next() when NODE_ENV is undefined', () => {
      delete process.env.NODE_ENV;
      const req = createMockReq();
      const res = createMockRes();
      const next = jest.fn();

      requireHttps(req, res, next);

      expect(next).toHaveBeenCalled();
      expect(res.redirect).not.toHaveBeenCalled();
    });

    it('should call next() when NODE_ENV is "test"', () => {
      process.env.NODE_ENV = 'test';
      const req = createMockReq();
      const res = createMockRes();
      const next = jest.fn();

      requireHttps(req, res, next);

      expect(next).toHaveBeenCalled();
    });
  });

  // -----------------------------------------------------------------------
  // Production: should enforce HTTPS
  // -----------------------------------------------------------------------
  describe('production', () => {
    beforeEach(() => {
      process.env.NODE_ENV = 'production';
    });

    it('should redirect HTTP to HTTPS with 301', () => {
      const req = createMockReq({ protocol: 'http' });
      const res = createMockRes();
      const next = jest.fn();

      requireHttps(req, res, next);

      expect(res.redirect).toHaveBeenCalledWith(301, 'https://example.com/api/test');
      expect(next).not.toHaveBeenCalled();
    });

    it('should allow HTTPS requests through', () => {
      const req = createMockReq({ protocol: 'https' });
      const res = createMockRes();
      const next = jest.fn();

      requireHttps(req, res, next);

      expect(next).toHaveBeenCalled();
      expect(res.redirect).not.toHaveBeenCalled();
    });

    it('should respect x-forwarded-proto: https header', () => {
      const req = createMockReq({
        protocol: 'http', // underlying protocol is HTTP (behind LB)
        headers: { 'x-forwarded-proto': 'https' } as Record<string, string>,
      });
      const res = createMockRes();
      const next = jest.fn();

      requireHttps(req, res, next);

      expect(next).toHaveBeenCalled();
      expect(res.redirect).not.toHaveBeenCalled();
    });

    it('should redirect when x-forwarded-proto is http', () => {
      const req = createMockReq({
        protocol: 'http',
        headers: { 'x-forwarded-proto': 'http' } as Record<string, string>,
      });
      const res = createMockRes();
      const next = jest.fn();

      requireHttps(req, res, next);

      expect(res.redirect).toHaveBeenCalledWith(301, 'https://example.com/api/test');
      expect(next).not.toHaveBeenCalled();
    });

    it('should preserve the original URL path and query string', () => {
      const req = createMockReq({
        protocol: 'http',
        originalUrl: '/api/influencers?niche=tech&page=2',
      });
      const res = createMockRes();
      const next = jest.fn();

      requireHttps(req, res, next);

      expect(res.redirect).toHaveBeenCalledWith(
        301,
        'https://example.com/api/influencers?niche=tech&page=2'
      );
    });
  });
});
