import { Request, Response, NextFunction } from 'express';

import {
  validateConsent,
  validateDsarRequest,
  validateDsarUpdate,
} from '../../../src/middleware/validate';

describe('privacy validators', () => {
  let mockReq: Partial<Request>;
  let mockRes: Partial<Response>;
  let next: NextFunction;

  beforeEach(() => {
    mockReq = { body: {} };
    mockRes = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn().mockReturnThis(),
    };
    next = jest.fn();
  });

  // -----------------------------------------------------------------------
  // validateConsent
  // -----------------------------------------------------------------------
  describe('validateConsent', () => {
    it('should pass for valid consent data', () => {
      mockReq.body = { consent_type: 'marketing', granted: true };
      validateConsent(mockReq as Request, mockRes as Response, next);
      expect(next).toHaveBeenCalled();
    });

    it('should pass for all valid consent types', () => {
      const types = ['data_processing', 'marketing', 'analytics', 'third_party_sharing'];
      for (const t of types) {
        jest.clearAllMocks();
        mockReq.body = { consent_type: t, granted: false };
        validateConsent(mockReq as Request, mockRes as Response, next);
        expect(next).toHaveBeenCalled();
      }
    });

    it('should reject invalid consent_type', () => {
      mockReq.body = { consent_type: 'invalid', granted: true };
      validateConsent(mockReq as Request, mockRes as Response, next);
      expect(mockRes.status).toHaveBeenCalledWith(400);
      expect(next).not.toHaveBeenCalled();
    });

    it('should reject missing consent_type', () => {
      mockReq.body = { granted: true };
      validateConsent(mockReq as Request, mockRes as Response, next);
      expect(mockRes.status).toHaveBeenCalledWith(400);
    });

    it('should reject non-boolean granted', () => {
      mockReq.body = { consent_type: 'marketing', granted: 'yes' };
      validateConsent(mockReq as Request, mockRes as Response, next);
      expect(mockRes.status).toHaveBeenCalledWith(400);
    });

    it('should reject missing granted field', () => {
      mockReq.body = { consent_type: 'marketing' };
      validateConsent(mockReq as Request, mockRes as Response, next);
      expect(mockRes.status).toHaveBeenCalledWith(400);
    });

    it('should reject empty body', () => {
      mockReq.body = undefined;
      validateConsent(mockReq as Request, mockRes as Response, next);
      expect(mockRes.status).toHaveBeenCalledWith(400);
    });
  });

  // -----------------------------------------------------------------------
  // validateDsarRequest
  // -----------------------------------------------------------------------
  describe('validateDsarRequest', () => {
    it('should pass for valid DSAR types', () => {
      const types = ['access', 'erasure', 'export'];
      for (const t of types) {
        jest.clearAllMocks();
        mockReq.body = { request_type: t };
        validateDsarRequest(mockReq as Request, mockRes as Response, next);
        expect(next).toHaveBeenCalled();
      }
    });

    it('should reject invalid request_type', () => {
      mockReq.body = { request_type: 'hack' };
      validateDsarRequest(mockReq as Request, mockRes as Response, next);
      expect(mockRes.status).toHaveBeenCalledWith(400);
    });

    it('should reject missing request_type', () => {
      mockReq.body = {};
      validateDsarRequest(mockReq as Request, mockRes as Response, next);
      expect(mockRes.status).toHaveBeenCalledWith(400);
    });

    it('should reject empty body', () => {
      mockReq.body = undefined;
      validateDsarRequest(mockReq as Request, mockRes as Response, next);
      expect(mockRes.status).toHaveBeenCalledWith(400);
    });
  });

  // -----------------------------------------------------------------------
  // validateDsarUpdate
  // -----------------------------------------------------------------------
  describe('validateDsarUpdate', () => {
    it('should pass for valid status', () => {
      const statuses = ['pending', 'processing', 'completed', 'rejected'];
      for (const s of statuses) {
        jest.clearAllMocks();
        mockReq.body = { status: s };
        validateDsarUpdate(mockReq as Request, mockRes as Response, next);
        expect(next).toHaveBeenCalled();
      }
    });

    it('should pass with optional notes', () => {
      mockReq.body = { status: 'completed', notes: 'Done processing' };
      validateDsarUpdate(mockReq as Request, mockRes as Response, next);
      expect(next).toHaveBeenCalled();
    });

    it('should reject invalid status', () => {
      mockReq.body = { status: 'invalid' };
      validateDsarUpdate(mockReq as Request, mockRes as Response, next);
      expect(mockRes.status).toHaveBeenCalledWith(400);
    });

    it('should reject missing status', () => {
      mockReq.body = {};
      validateDsarUpdate(mockReq as Request, mockRes as Response, next);
      expect(mockRes.status).toHaveBeenCalledWith(400);
    });

    it('should reject non-string notes', () => {
      mockReq.body = { status: 'completed', notes: 12345 };
      validateDsarUpdate(mockReq as Request, mockRes as Response, next);
      expect(mockRes.status).toHaveBeenCalledWith(400);
    });

    it('should reject overly long notes', () => {
      mockReq.body = { status: 'completed', notes: 'x'.repeat(5001) };
      validateDsarUpdate(mockReq as Request, mockRes as Response, next);
      expect(mockRes.status).toHaveBeenCalledWith(400);
    });
  });
});
