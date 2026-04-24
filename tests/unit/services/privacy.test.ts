// Mock supabase before importing the module
const mockFrom = jest.fn();

jest.mock('../../../src/services/supabase', () => ({
  supabase: { from: mockFrom },
  createScopedClient: jest.fn(() => ({ from: mockFrom })),
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
  upsertConsent,
  getConsents,
  createDsarRequest,
  getDsarRequests,
  updateDsarStatus,
  exportUserData,
  eraseUserData,
  purgeExpiredData,
  anonymizeAuditLogIps,
  anonymizeIp,
} from '../../../src/services/privacy';

// Stand-in scoped client object — its `.from()` is the same mock as the
// service-role client because the integration tests share one mockFrom.
const scopedClient = { from: mockFrom } as unknown as Parameters<typeof upsertConsent>[0];

const mockInsert = jest.fn();
const mockSelect = jest.fn();
const mockSingle = jest.fn();
const mockEq = jest.fn();
const mockNot = jest.fn();
const mockOrder = jest.fn();
const mockUpdate = jest.fn();
const mockDelete = jest.fn();
const mockLt = jest.fn();

function setupChain() {
  const chain: Record<string, jest.Mock> = {
    insert: mockInsert,
    select: mockSelect,
    single: mockSingle,
    eq: mockEq,
    not: mockNot,
    order: mockOrder,
    update: mockUpdate,
    delete: mockDelete,
    upsert: jest.fn(),
    lt: mockLt,
  };
  for (const key of Object.keys(chain)) {
    chain[key].mockReturnValue(chain);
  }
  return chain;
}

describe('privacy service', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  // -----------------------------------------------------------------------
  // anonymizeIp
  // -----------------------------------------------------------------------
  describe('anonymizeIp', () => {
    it('should anonymize IPv4 by zeroing last octet', () => {
      expect(anonymizeIp('192.168.1.100')).toBe('192.168.1.0');
    });

    it('should anonymize another IPv4 address', () => {
      expect(anonymizeIp('10.0.0.255')).toBe('10.0.0.0');
    });

    it('should anonymize IPv6 by keeping first 4 groups', () => {
      expect(anonymizeIp('2001:0db8:85a3:0000:0000:8a2e:0370:7334')).toBe('2001:0db8:85a3:0000::');
    });

    it('should return null for null input', () => {
      expect(anonymizeIp(null)).toBeNull();
    });

    it('should return null for undefined input', () => {
      expect(anonymizeIp(undefined)).toBeNull();
    });

    it('should return null for empty string', () => {
      expect(anonymizeIp('')).toBeNull();
    });

    it('should handle loopback address', () => {
      expect(anonymizeIp('127.0.0.1')).toBe('127.0.0.0');
    });
  });

  // -----------------------------------------------------------------------
  // upsertConsent
  // -----------------------------------------------------------------------
  describe('upsertConsent', () => {
    it('should upsert consent and return the record', async () => {
      const chain = setupChain();
      mockFrom.mockReturnValue(chain);
      const consentRecord = { id: 'c1', user_id: 'user-1', consent_type: 'marketing', granted: true };
      chain.single.mockResolvedValue({ data: consentRecord, error: null });

      const result = await upsertConsent(scopedClient, 'user-1', 'marketing', true, '1.2.3.4');

      expect(mockFrom).toHaveBeenCalledWith('consent');
      expect(result).toEqual(consentRecord);
    });

    it('should return null on error', async () => {
      const chain = setupChain();
      mockFrom.mockReturnValue(chain);
      chain.single.mockResolvedValue({ data: null, error: { message: 'DB error' } });

      const result = await upsertConsent(scopedClient, 'user-1', 'marketing', false);

      expect(result).toBeNull();
    });
  });

  // -----------------------------------------------------------------------
  // getConsents
  // -----------------------------------------------------------------------
  describe('getConsents', () => {
    it('should return consent records for a user', async () => {
      const chain = setupChain();
      mockFrom.mockReturnValue(chain);
      const consents = [{ id: 'c1', consent_type: 'marketing', granted: true }];
      chain.order.mockResolvedValue({ data: consents, error: null });

      const result = await getConsents(scopedClient, 'user-1');

      expect(mockFrom).toHaveBeenCalledWith('consent');
      expect(result).toEqual(consents);
    });

    it('should return empty array on error', async () => {
      const chain = setupChain();
      mockFrom.mockReturnValue(chain);
      chain.order.mockResolvedValue({ data: null, error: { message: 'error' } });

      const result = await getConsents(scopedClient, 'user-1');

      expect(result).toEqual([]);
    });
  });

  // -----------------------------------------------------------------------
  // createDsarRequest
  // -----------------------------------------------------------------------
  describe('createDsarRequest', () => {
    it('should create a DSAR request', async () => {
      const chain = setupChain();
      mockFrom.mockReturnValue(chain);
      const dsarRecord = { id: 'd1', user_id: 'user-1', request_type: 'access', status: 'pending' };
      chain.single.mockResolvedValue({ data: dsarRecord, error: null });

      const result = await createDsarRequest(scopedClient, 'user-1', 'test@test.com', 'access');

      expect(mockFrom).toHaveBeenCalledWith('dsar_requests');
      expect(result).toEqual(dsarRecord);
    });

    it('should return null on error', async () => {
      const chain = setupChain();
      mockFrom.mockReturnValue(chain);
      chain.single.mockResolvedValue({ data: null, error: { message: 'error' } });

      const result = await createDsarRequest(scopedClient, 'user-1', undefined, 'erasure');

      expect(result).toBeNull();
    });
  });

  // -----------------------------------------------------------------------
  // getDsarRequests
  // -----------------------------------------------------------------------
  describe('getDsarRequests', () => {
    it('should return DSAR requests for a user', async () => {
      const chain = setupChain();
      mockFrom.mockReturnValue(chain);
      const requests = [{ id: 'd1', request_type: 'access', status: 'pending' }];
      chain.order.mockResolvedValue({ data: requests, error: null });

      const result = await getDsarRequests(scopedClient, 'user-1');

      expect(result).toEqual(requests);
    });

    it('should return empty array on error', async () => {
      const chain = setupChain();
      mockFrom.mockReturnValue(chain);
      chain.order.mockResolvedValue({ data: null, error: { message: 'error' } });

      const result = await getDsarRequests(scopedClient, 'user-1');

      expect(result).toEqual([]);
    });
  });

  // -----------------------------------------------------------------------
  // updateDsarStatus
  // -----------------------------------------------------------------------
  describe('updateDsarStatus', () => {
    it('should update DSAR request status', async () => {
      const chain = setupChain();
      mockFrom.mockReturnValue(chain);
      const updated = { id: 'd1', status: 'completed' };
      chain.single.mockResolvedValue({ data: updated, error: null });

      const result = await updateDsarStatus('d1', 'completed', 'Done');

      expect(mockFrom).toHaveBeenCalledWith('dsar_requests');
      expect(result).toEqual(updated);
    });

    it('should return null on error', async () => {
      const chain = setupChain();
      mockFrom.mockReturnValue(chain);
      chain.single.mockResolvedValue({ data: null, error: { message: 'not found' } });

      const result = await updateDsarStatus('d1', 'rejected');

      expect(result).toBeNull();
    });
  });

  // -----------------------------------------------------------------------
  // exportUserData
  // -----------------------------------------------------------------------
  describe('exportUserData', () => {
    it('should export all user data', async () => {
      const chain = setupChain();
      mockFrom.mockReturnValue(chain);

      // Each table query returns an order or just data
      chain.order.mockResolvedValue({ data: [{ id: 'a1' }], error: null });
      chain.eq.mockReturnValue(chain);
      chain.select.mockReturnValue(chain);

      const result = await exportUserData('user-1');

      expect(result).toHaveProperty('user_id', 'user-1');
      expect(result).toHaveProperty('exported_at');
      expect(result).toHaveProperty('audit_logs');
      expect(result).toHaveProperty('consents');
      expect(result).toHaveProperty('dsar_requests');
    });
  });

  // -----------------------------------------------------------------------
  // eraseUserData
  // -----------------------------------------------------------------------
  describe('eraseUserData', () => {
    it('should erase user data and return summary', async () => {
      const chain = setupChain();
      mockFrom.mockReturnValue(chain);
      chain.delete.mockReturnValue(chain);
      chain.eq.mockResolvedValue({ error: null });
      chain.update.mockReturnValue(chain);

      const result = await eraseUserData('user-1');

      expect(result).toHaveProperty('deletedTables');
      expect(result).toHaveProperty('errors');
      expect(result.deletedTables.length).toBeGreaterThan(0);
    });

    it('should report errors for failed deletions', async () => {
      const chain = setupChain();
      mockFrom.mockReturnValue(chain);
      chain.delete.mockReturnValue(chain);
      chain.eq.mockResolvedValue({ error: { message: 'DB error' } });
      chain.update.mockReturnValue(chain);

      const result = await eraseUserData('user-1');

      expect(result.errors.length).toBeGreaterThan(0);
    });
  });

  // -----------------------------------------------------------------------
  // purgeExpiredData
  // -----------------------------------------------------------------------
  describe('purgeExpiredData', () => {
    it('should purge expired data and return counts', async () => {
      const chain = setupChain();
      mockFrom.mockReturnValue(chain);
      chain.delete.mockReturnValue(chain);
      chain.lt.mockResolvedValue({ count: 5, error: null });

      const result = await purgeExpiredData();

      expect(result).toHaveProperty('audit_log');
      expect(result).toHaveProperty('revoked_tokens');
      expect(result).toHaveProperty('dsar_requests');
    });

    it('should report -1 for tables that fail', async () => {
      const chain = setupChain();
      mockFrom.mockReturnValue(chain);
      chain.delete.mockReturnValue(chain);
      chain.lt.mockResolvedValue({ count: null, error: { message: 'error' } });

      const result = await purgeExpiredData();

      expect(Object.values(result)).toContain(-1);
    });
  });

  // -----------------------------------------------------------------------
  // anonymizeAuditLogIps
  // -----------------------------------------------------------------------
  describe('anonymizeAuditLogIps', () => {
    it('should anonymize IPs in audit log', async () => {
      const chain = setupChain();
      mockFrom.mockReturnValue(chain);

      // First call: select entries
      chain.not.mockResolvedValueOnce({
        data: [{ id: 'a1', ip_address: '192.168.1.100' }],
        error: null,
      });

      // Second call: update
      chain.eq.mockResolvedValueOnce({ error: null });

      const count = await anonymizeAuditLogIps();

      expect(count).toBe(1);
    });

    it('should return 0 on fetch error', async () => {
      const chain = setupChain();
      mockFrom.mockReturnValue(chain);
      chain.not.mockResolvedValue({ data: null, error: { message: 'error' } });

      const count = await anonymizeAuditLogIps();

      expect(count).toBe(0);
    });
  });
});
