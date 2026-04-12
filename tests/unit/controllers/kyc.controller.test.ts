// Mock kyc service before importing controller
const mockInitiateVerification = jest.fn();
const mockGetKycByUserId = jest.fn();
const mockSyncVerificationStatus = jest.fn();

jest.mock('../../../src/services/kyc', () => ({
  initiateVerification: mockInitiateVerification,
  getKycByUserId: mockGetKycByUserId,
  syncVerificationStatus: mockSyncVerificationStatus,
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

import { verifyKyc, getKycStatus } from '../../../src/controllers/kyc.controller';

function mockReq(
  user?: { sub: string; email?: string; role?: string },
  body?: Record<string, unknown>,
  params?: Record<string, string>
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
): any {
  return { user: user as any, body, params: (params ?? {}) as any };
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function mockRes(): any {
  const res: Record<string, jest.Mock> = {};
  res.status = jest.fn().mockReturnValue(res);
  res.json = jest.fn().mockReturnValue(res);
  return res;
}

beforeEach(() => {
  jest.clearAllMocks();
});

// ---------------------------------------------------------------------------
// verifyKyc
// ---------------------------------------------------------------------------
describe('verifyKyc controller', () => {
  it('should return 201 with pending record', async () => {
    const record = {
      kyc_status: 'pending',
      applicant_id: 'app-1',
    };
    mockInitiateVerification.mockResolvedValue(record);

    const req = mockReq(
      { sub: 'user-1', email: 'u@test.com' },
      { country: 'USA', id_doc_type: 'PASSPORT' }
    );
    const res = mockRes();

    await verifyKyc(req, res);

    expect(res.status).toHaveBeenCalledWith(201);
    expect(res.json).toHaveBeenCalledWith({
      kyc_status: 'pending',
      applicant_id: 'app-1',
      message: 'KYC verification initiated',
    });
  });

  it('should return already verified message', async () => {
    const record = {
      kyc_status: 'verified',
      applicant_id: 'app-1',
    };
    mockInitiateVerification.mockResolvedValue(record);

    const req = mockReq(
      { sub: 'user-1' },
      { country: 'USA', id_doc_type: 'PASSPORT' }
    );
    const res = mockRes();

    await verifyKyc(req, res);

    expect(res.status).toHaveBeenCalledWith(201);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ message: 'KYC already verified' })
    );
  });

  it('should return 502 on KYC provider error', async () => {
    mockInitiateVerification.mockRejectedValue(new Error('KYC provider error'));

    const req = mockReq(
      { sub: 'user-1' },
      { country: 'USA', id_doc_type: 'PASSPORT' }
    );
    const res = mockRes();

    await verifyKyc(req, res);

    expect(res.status).toHaveBeenCalledWith(502);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ error: expect.stringContaining('KYC provider') })
    );
  });

  it('should return 500 on unexpected error', async () => {
    mockInitiateVerification.mockRejectedValue(new Error('Something unexpected'));

    const req = mockReq(
      { sub: 'user-1' },
      { country: 'USA', id_doc_type: 'PASSPORT' }
    );
    const res = mockRes();

    await verifyKyc(req, res);

    expect(res.status).toHaveBeenCalledWith(500);
    expect(res.json).toHaveBeenCalledWith({ error: 'Internal server error' });
  });
});

// ---------------------------------------------------------------------------
// getKycStatus
// ---------------------------------------------------------------------------
describe('getKycStatus controller', () => {
  it('should return status for own user', async () => {
    const record = {
      kyc_status: 'pending',
      applicant_id: 'app-1',
      verified_at: null,
      rejection_reason: null,
    };
    mockSyncVerificationStatus.mockResolvedValue(record);

    const req = mockReq(
      { sub: 'user-1', role: 'user' },
      undefined,
      { userId: 'user-1' }
    );
    const res = mockRes();

    await getKycStatus(req, res);

    expect(res.json).toHaveBeenCalledWith({
      kyc_status: 'pending',
      applicant_id: 'app-1',
      verified_at: null,
      rejection_reason: null,
    });
  });

  it('should deny non-admin checking other user', async () => {
    const req = mockReq(
      { sub: 'user-1', role: 'user' },
      undefined,
      { userId: 'other-user' }
    );
    const res = mockRes();

    await getKycStatus(req, res);

    expect(res.status).toHaveBeenCalledWith(403);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ error: expect.stringContaining('own KYC status') })
    );
  });

  it('should allow admin to check any user', async () => {
    const record = {
      kyc_status: 'verified',
      applicant_id: 'app-1',
      verified_at: '2026-01-01',
      rejection_reason: null,
    };
    mockSyncVerificationStatus.mockResolvedValue(record);

    const req = mockReq(
      { sub: 'admin-1', role: 'admin' },
      undefined,
      { userId: 'user-1' }
    );
    const res = mockRes();

    await getKycStatus(req, res);

    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ kyc_status: 'verified' })
    );
  });

  it('should return pending when no record exists', async () => {
    mockSyncVerificationStatus.mockRejectedValue(new Error('No KYC record found'));
    mockGetKycByUserId.mockResolvedValue(null);

    const req = mockReq(
      { sub: 'user-1', role: 'user' },
      undefined,
      { userId: 'user-1' }
    );
    const res = mockRes();

    await getKycStatus(req, res);

    expect(res.json).toHaveBeenCalledWith({
      kyc_status: 'pending',
      message: 'No KYC verification initiated',
    });
  });

  it('should return 500 on unexpected error', async () => {
    mockSyncVerificationStatus.mockRejectedValue(new Error('unexpected'));
    mockGetKycByUserId.mockRejectedValue(new Error('DB down'));

    const req = mockReq(
      { sub: 'user-1', role: 'user' },
      undefined,
      { userId: 'user-1' }
    );
    const res = mockRes();

    await getKycStatus(req, res);

    expect(res.status).toHaveBeenCalledWith(500);
    expect(res.json).toHaveBeenCalledWith({ error: 'Internal server error' });
  });
});
