// Mock supabase before importing service
const mockSelect = jest.fn();
const mockSingle = jest.fn();
const mockEq = jest.fn();
const mockMaybeSingle = jest.fn();
const mockUpsert = jest.fn();
const mockFrom = jest.fn();

const queryChain: Record<string, jest.Mock> = {
  select: mockSelect,
  single: mockSingle,
  eq: mockEq,
  maybeSingle: mockMaybeSingle,
  upsert: mockUpsert,
  from: mockFrom,
};

function setupChain() {
  for (const key of Object.keys(queryChain)) {
    queryChain[key].mockReturnValue(queryChain);
  }
  mockFrom.mockReturnValue(queryChain);
}

setupChain();

jest.mock('../../../src/services/supabase', () => ({
  supabase: { from: mockFrom },
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

// Mock axios
jest.mock('axios', () => {
  const fn = jest.fn();
  return { __esModule: true, default: fn };
});

import axios from 'axios';
import {
  getKycByUserId,
  upsertKycRecord,
  initiateVerification,
  syncVerificationStatus,
  generateSignature,
} from '../../../src/services/kyc';

beforeEach(() => {
  jest.clearAllMocks();
  delete (queryChain as any).then;
  setupChain();
});

// ---------------------------------------------------------------------------
// generateSignature
// ---------------------------------------------------------------------------
describe('generateSignature', () => {
  it('should return a hex string', () => {
    const sig = generateSignature('GET', '/test', 1700000000);
    expect(sig).toMatch(/^[a-f0-9]+$/);
  });

  it('should produce different signatures for different inputs', () => {
    const sig1 = generateSignature('GET', '/path1', 1700000000);
    const sig2 = generateSignature('GET', '/path2', 1700000000);
    expect(sig1).not.toBe(sig2);
  });
});

// ---------------------------------------------------------------------------
// getKycByUserId
// ---------------------------------------------------------------------------
describe('getKycByUserId', () => {
  it('should return null when no record exists', async () => {
    mockMaybeSingle.mockResolvedValueOnce({ data: null, error: null });

    const result = await getKycByUserId('user-1');
    expect(result).toBeNull();
    expect(mockFrom).toHaveBeenCalledWith('kyc_verifications');
  });

  it('should return the record when found', async () => {
    const record = { id: 'kyc-1', user_id: 'user-1', kyc_status: 'verified' };
    mockMaybeSingle.mockResolvedValueOnce({ data: record, error: null });

    const result = await getKycByUserId('user-1');
    expect(result).toEqual(record);
  });

  it('should throw on database error', async () => {
    mockMaybeSingle.mockResolvedValueOnce({
      data: null,
      error: { message: 'DB error' },
    });

    await expect(getKycByUserId('user-1')).rejects.toThrow('Failed to fetch KYC status');
  });
});

// ---------------------------------------------------------------------------
// upsertKycRecord
// ---------------------------------------------------------------------------
describe('upsertKycRecord', () => {
  it('should upsert and return the record', async () => {
    const record = { id: 'kyc-1', user_id: 'user-1', kyc_status: 'pending' };
    mockSingle.mockResolvedValueOnce({ data: record, error: null });

    const result = await upsertKycRecord('user-1', { kyc_status: 'pending' });
    expect(result).toEqual(record);
    expect(mockFrom).toHaveBeenCalledWith('kyc_verifications');
    expect(mockUpsert).toHaveBeenCalled();
  });

  it('should throw on database error', async () => {
    mockSingle.mockResolvedValueOnce({
      data: null,
      error: { message: 'upsert failed' },
    });

    await expect(
      upsertKycRecord('user-1', { kyc_status: 'pending' })
    ).rejects.toThrow('Failed to upsert KYC record');
  });
});

// ---------------------------------------------------------------------------
// initiateVerification
// ---------------------------------------------------------------------------
describe('initiateVerification', () => {
  it('should return existing record if already verified', async () => {
    const existing = { id: 'kyc-1', user_id: 'user-1', kyc_status: 'verified' };
    mockMaybeSingle.mockResolvedValueOnce({ data: existing, error: null });

    const result = await initiateVerification('user-1', 'USA', 'PASSPORT');
    expect(result).toEqual(existing);
    // Should NOT call Sumsub
    expect(axios).not.toHaveBeenCalled();
  });

  it('should create applicant on Sumsub and persist pending record', async () => {
    // No existing record
    mockMaybeSingle.mockResolvedValueOnce({ data: null, error: null });

    // Sumsub returns applicant ID
    (axios as unknown as jest.Mock).mockResolvedValueOnce({
      data: { id: 'sumsub-456' },
    });

    // upsertKycRecord
    const newRecord = {
      id: 'kyc-2',
      user_id: 'user-1',
      kyc_status: 'pending',
      applicant_id: 'sumsub-456',
    };
    mockSingle.mockResolvedValueOnce({ data: newRecord, error: null });

    const result = await initiateVerification('user-1', 'USA', 'PASSPORT');
    expect(result).toEqual(newRecord);
    expect(axios).toHaveBeenCalledTimes(1);
  });

  it('should throw on Sumsub API failure', async () => {
    mockMaybeSingle.mockResolvedValueOnce({ data: null, error: null });
    (axios as unknown as jest.Mock).mockRejectedValueOnce(
      Object.assign(new Error('Network Error'), { response: { status: 500 } })
    );

    await expect(
      initiateVerification('user-1', 'USA', 'PASSPORT')
    ).rejects.toThrow('KYC provider error');
  });
});

// ---------------------------------------------------------------------------
// syncVerificationStatus
// ---------------------------------------------------------------------------
describe('syncVerificationStatus', () => {
  it('should throw when no KYC record exists', async () => {
    mockMaybeSingle.mockResolvedValueOnce({ data: null, error: null });

    await expect(syncVerificationStatus('user-1')).rejects.toThrow(
      'No KYC record found'
    );
  });

  it('should return immediately if already verified', async () => {
    const record = { id: 'kyc-1', user_id: 'user-1', kyc_status: 'verified', applicant_id: 'a1' };
    mockMaybeSingle.mockResolvedValueOnce({ data: record, error: null });

    const result = await syncVerificationStatus('user-1');
    expect(result).toEqual(record);
    expect(axios).not.toHaveBeenCalled();
  });

  it('should return record if no applicant_id', async () => {
    const record = { id: 'kyc-1', user_id: 'user-1', kyc_status: 'pending', applicant_id: null };
    mockMaybeSingle.mockResolvedValueOnce({ data: record, error: null });

    const result = await syncVerificationStatus('user-1');
    expect(result).toEqual(record);
    expect(axios).not.toHaveBeenCalled();
  });

  it('should sync GREEN status from provider', async () => {
    const record = { id: 'kyc-1', user_id: 'user-1', kyc_status: 'pending', applicant_id: 'a1' };
    mockMaybeSingle.mockResolvedValueOnce({ data: record, error: null });

    (axios as unknown as jest.Mock).mockResolvedValueOnce({
      data: {
        reviewStatus: 'completed',
        reviewResult: { reviewAnswer: 'GREEN' },
      },
    });

    const updatedRecord = { ...record, kyc_status: 'verified' };
    mockSingle.mockResolvedValueOnce({ data: updatedRecord, error: null });

    const result = await syncVerificationStatus('user-1');
    expect(result.kyc_status).toBe('verified');
  });

  it('should sync RED status from provider', async () => {
    const record = { id: 'kyc-1', user_id: 'user-1', kyc_status: 'pending', applicant_id: 'a1' };
    mockMaybeSingle.mockResolvedValueOnce({ data: record, error: null });

    (axios as unknown as jest.Mock).mockResolvedValueOnce({
      data: {
        reviewStatus: 'completed',
        reviewResult: { reviewAnswer: 'RED', rejectLabels: ['FORGERY'] },
      },
    });

    const updatedRecord = { ...record, kyc_status: 'rejected' };
    mockSingle.mockResolvedValueOnce({ data: updatedRecord, error: null });

    const result = await syncVerificationStatus('user-1');
    expect(result.kyc_status).toBe('rejected');
  });

  it('should return stale record on provider API error', async () => {
    const record = { id: 'kyc-1', user_id: 'user-1', kyc_status: 'pending', applicant_id: 'a1' };
    mockMaybeSingle.mockResolvedValueOnce({ data: record, error: null });

    (axios as unknown as jest.Mock).mockRejectedValueOnce(new Error('API down'));

    const result = await syncVerificationStatus('user-1');
    expect(result).toEqual(record);
  });
});
