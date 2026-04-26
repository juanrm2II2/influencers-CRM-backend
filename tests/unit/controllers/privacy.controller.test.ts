import { Request, Response } from 'express';

// Mock the privacy service
const mockUpsertConsent = jest.fn();
const mockGetConsents = jest.fn();
const mockCreateDsarRequest = jest.fn();
const mockGetDsarRequests = jest.fn();
const mockUpdateDsarStatus = jest.fn();
const mockExportUserData = jest.fn();
const mockEraseUserData = jest.fn();
const mockPurgeExpiredData = jest.fn();

jest.mock('../../../src/services/privacy', () => ({
  upsertConsent: mockUpsertConsent,
  getConsents: mockGetConsents,
  createDsarRequest: mockCreateDsarRequest,
  getDsarRequests: mockGetDsarRequests,
  updateDsarStatus: mockUpdateDsarStatus,
  exportUserData: mockExportUserData,
  eraseUserData: mockEraseUserData,
  purgeExpiredData: mockPurgeExpiredData,
}));

jest.mock('../../../src/logger', () => ({
  logger: {
    info: jest.fn(),
    error: jest.fn(),
    warn: jest.fn(),
    debug: jest.fn(),
    fatal: jest.fn(),
  },
}));

import {
  listConsents,
  updateConsent,
  listDsarRequests,
  createDsar,
  updateDsar,
  exportData,
  eraseData,
  purgeData,
} from '../../../src/controllers/privacy.controller';

describe('privacy controller', () => {
  let mockReq: Partial<Request>;
  let mockRes: Partial<Response>;

  beforeEach(() => {
    jest.clearAllMocks();
    mockReq = {
      user: { sub: 'user-1', email: 'test@test.com', iat: 0 },
      body: {},
      params: {},
      ip: '127.0.0.1',
      // The controller now reads its DB client from req.scopedClient
      // (audit H1).  A truthy stand-in is enough — the actual DB calls
      // happen inside the mocked privacy service.
      scopedClient: {} as unknown as Request['scopedClient'],
    };
    mockRes = {
      json: jest.fn().mockReturnThis(),
      status: jest.fn().mockReturnThis(),
      setHeader: jest.fn().mockReturnThis(),
      send: jest.fn().mockReturnThis(),
    };
  });

  // -----------------------------------------------------------------------
  // Consent
  // -----------------------------------------------------------------------
  describe('listConsents', () => {
    it('should return consents for the user', async () => {
      const consents = [{ id: 'c1', consent_type: 'marketing', granted: true }];
      mockGetConsents.mockResolvedValue(consents);

      await listConsents(mockReq as Request, mockRes as Response);

      expect(mockGetConsents).toHaveBeenCalledWith(mockReq.scopedClient, 'user-1');
      expect(mockRes.json).toHaveBeenCalledWith({ data: consents });
    });

    it('should return 500 on error', async () => {
      mockGetConsents.mockRejectedValue(new Error('DB error'));

      await listConsents(mockReq as Request, mockRes as Response);

      expect(mockRes.status).toHaveBeenCalledWith(500);
    });
  });

  describe('updateConsent', () => {
    it('should update consent and return the record', async () => {
      mockReq.body = { consent_type: 'marketing', granted: true };
      const result = { id: 'c1', consent_type: 'marketing', granted: true };
      mockUpsertConsent.mockResolvedValue(result);

      await updateConsent(mockReq as Request, mockRes as Response);

      expect(mockUpsertConsent).toHaveBeenCalledWith(mockReq.scopedClient, 'user-1', 'marketing', true, '127.0.0.1');
      expect(mockRes.status).toHaveBeenCalledWith(200);
      expect(mockRes.json).toHaveBeenCalledWith(result);
    });

    it('should return 500 when upsert fails', async () => {
      mockReq.body = { consent_type: 'marketing', granted: false };
      mockUpsertConsent.mockResolvedValue(null);

      await updateConsent(mockReq as Request, mockRes as Response);

      expect(mockRes.status).toHaveBeenCalledWith(500);
    });
  });

  // -----------------------------------------------------------------------
  // DSAR
  // -----------------------------------------------------------------------
  describe('listDsarRequests', () => {
    it('should return DSAR requests for the user', async () => {
      const requests = [{ id: 'd1', request_type: 'access', status: 'pending' }];
      mockGetDsarRequests.mockResolvedValue(requests);

      await listDsarRequests(mockReq as Request, mockRes as Response);

      expect(mockGetDsarRequests).toHaveBeenCalledWith(mockReq.scopedClient, 'user-1');
      expect(mockRes.json).toHaveBeenCalledWith({ data: requests });
    });
  });

  describe('createDsar', () => {
    it('should create a DSAR request', async () => {
      mockReq.body = { request_type: 'access' };
      const result = { id: 'd1', request_type: 'access', status: 'pending' };
      mockCreateDsarRequest.mockResolvedValue(result);

      await createDsar(mockReq as Request, mockRes as Response);

      expect(mockCreateDsarRequest).toHaveBeenCalledWith(mockReq.scopedClient, 'user-1', 'test@test.com', 'access');
      expect(mockRes.status).toHaveBeenCalledWith(201);
    });

    it('should return 500 when creation fails', async () => {
      mockReq.body = { request_type: 'erasure' };
      mockCreateDsarRequest.mockResolvedValue(null);

      await createDsar(mockReq as Request, mockRes as Response);

      expect(mockRes.status).toHaveBeenCalledWith(500);
    });
  });

  describe('updateDsar', () => {
    it('should update DSAR status (admin) and forward admin context (audit L8)', async () => {
      (mockReq as any).params = { id: 'd1' };
      mockReq.body = { status: 'completed', notes: 'Done' };
      const result = { id: 'd1', status: 'completed' };
      mockUpdateDsarStatus.mockResolvedValue(result);

      await updateDsar(mockReq as any, mockRes as Response);

      expect(mockUpdateDsarStatus).toHaveBeenCalledWith(
        'd1',
        'completed',
        'Done',
        { adminId: 'user-1', adminEmail: 'test@test.com' },
      );
      expect(mockRes.json).toHaveBeenCalledWith(result);
    });

    it('should return 404 when request not found', async () => {
      (mockReq as any).params = { id: 'd1' };
      mockReq.body = { status: 'rejected' };
      mockUpdateDsarStatus.mockResolvedValue(null);

      await updateDsar(mockReq as any, mockRes as Response);

      expect(mockRes.status).toHaveBeenCalledWith(404);
    });
  });

  // -----------------------------------------------------------------------
  // Export
  // -----------------------------------------------------------------------
  describe('exportData', () => {
    it('should export user data with appropriate headers', async () => {
      const data = { user_id: 'user-1', audit_logs: [], consents: [] };
      mockExportUserData.mockResolvedValue(data);

      await exportData(mockReq as Request, mockRes as Response);

      expect(mockExportUserData).toHaveBeenCalledWith('user-1');
      expect(mockRes.setHeader).toHaveBeenCalledWith('Content-Type', 'application/json');
      expect(mockRes.setHeader).toHaveBeenCalledWith(
        'Content-Disposition',
        expect.stringContaining('user-data-export-')
      );
      expect(mockRes.json).toHaveBeenCalledWith(data);
    });

    it('should return 500 on error', async () => {
      mockExportUserData.mockRejectedValue(new Error('error'));

      await exportData(mockReq as Request, mockRes as Response);

      expect(mockRes.status).toHaveBeenCalledWith(500);
    });
  });

  // -----------------------------------------------------------------------
  // Erasure
  // -----------------------------------------------------------------------
  describe('eraseData', () => {
    it('should erase data and return success', async () => {
      mockEraseUserData.mockResolvedValue({ deletedTables: ['consent'], errors: [] });

      await eraseData(mockReq as Request, mockRes as Response);

      expect(mockEraseUserData).toHaveBeenCalledWith('user-1');
      expect(mockRes.json).toHaveBeenCalledWith(
        expect.objectContaining({ message: 'All personal data has been erased' })
      );
    });

    it('should return 207 on partial failure', async () => {
      mockEraseUserData.mockResolvedValue({
        deletedTables: ['consent'],
        errors: ['audit_log: DB error'],
      });

      await eraseData(mockReq as Request, mockRes as Response);

      expect(mockRes.status).toHaveBeenCalledWith(207);
    });
  });

  // -----------------------------------------------------------------------
  // Purge
  // -----------------------------------------------------------------------
  describe('purgeData', () => {
    it('should purge data and return results', async () => {
      const results = { audit_log: 5, revoked_tokens: 2, dsar_requests: 0 };
      mockPurgeExpiredData.mockResolvedValue(results);

      await purgeData(mockReq as Request, mockRes as Response);

      expect(mockRes.json).toHaveBeenCalledWith(
        expect.objectContaining({ results })
      );
    });

    it('should return 500 on error', async () => {
      mockPurgeExpiredData.mockRejectedValue(new Error('error'));

      await purgeData(mockReq as Request, mockRes as Response);

      expect(mockRes.status).toHaveBeenCalledWith(500);
    });
  });
});
