// Mock Supabase before importing the module under test
const mockUpsert = jest.fn();
const mockSelectChain = jest.fn();
const mockDeleteChain = jest.fn();
const mockEq = jest.fn();
const mockMaybeSingle = jest.fn();
const mockLt = jest.fn();

jest.mock('../../../src/services/supabase', () => ({
  supabase: {
    from: jest.fn((table: string) => {
      if (table !== 'revoked_tokens') {
        throw new Error(`Unexpected table: ${table}`);
      }
      return {
        upsert: mockUpsert,
        select: mockSelectChain,
        delete: () => ({ lt: mockLt }),
      };
    }),
  },
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

import { tokenBlocklist } from '../../../src/services/tokenBlocklist';
import { logger } from '../../../src/logger';

afterAll(() => {
  tokenBlocklist.destroy();
});

beforeEach(() => {
  jest.clearAllMocks();
  tokenBlocklist.clearCaches();
});

describe('TokenBlocklist.revoke', () => {
  it('should upsert the token into revoked_tokens table', async () => {
    mockUpsert.mockResolvedValue({ error: null });

    await tokenBlocklist.revoke('my-jti', 1700000000);

    expect(mockUpsert).toHaveBeenCalledWith(
      { token: 'my-jti', expires_at: new Date(1700000000 * 1000).toISOString() },
      { onConflict: 'token' }
    );
  });

  it('should throw and log on Supabase error', async () => {
    const supaErr = { message: 'db down', code: '500' };
    mockUpsert.mockResolvedValue({ error: supaErr });

    await expect(tokenBlocklist.revoke('tok', 123)).rejects.toThrow(
      'Failed to revoke token'
    );
    expect(logger.error).toHaveBeenCalled();
  });

  it('should populate the in-memory revoked cache on successful revoke', async () => {
    mockUpsert.mockResolvedValue({ error: null });

    await tokenBlocklist.revoke('cached-tok', 1700000000);

    expect(tokenBlocklist.cacheStats.revokedSize).toBe(1);
  });
});

describe('TokenBlocklist.isRevoked', () => {
  it('should return true when token exists in the database', async () => {
    mockEq.mockReturnValue({ maybeSingle: mockMaybeSingle });
    mockSelectChain.mockReturnValue({ eq: mockEq });
    mockMaybeSingle.mockResolvedValue({ data: { token: 'tok-1' }, error: null });

    const result = await tokenBlocklist.isRevoked('tok-1');

    expect(result).toBe(true);
    expect(mockSelectChain).toHaveBeenCalledWith('token');
    expect(mockEq).toHaveBeenCalledWith('token', 'tok-1');
  });

  it('should return false when token is not in the database', async () => {
    mockEq.mockReturnValue({ maybeSingle: mockMaybeSingle });
    mockSelectChain.mockReturnValue({ eq: mockEq });
    mockMaybeSingle.mockResolvedValue({ data: null, error: null });

    const result = await tokenBlocklist.isRevoked('tok-unknown');

    expect(result).toBe(false);
  });

  it('should populate known-good cache when DB says token is not revoked', async () => {
    mockEq.mockReturnValue({ maybeSingle: mockMaybeSingle });
    mockSelectChain.mockReturnValue({ eq: mockEq });
    mockMaybeSingle.mockResolvedValue({ data: null, error: null });

    await tokenBlocklist.isRevoked('good-tok');

    expect(tokenBlocklist.cacheStats.knownGoodSize).toBe(1);
  });

  it('should populate revoked cache when DB says token is revoked', async () => {
    mockEq.mockReturnValue({ maybeSingle: mockMaybeSingle });
    mockSelectChain.mockReturnValue({ eq: mockEq });
    mockMaybeSingle.mockResolvedValue({ data: { token: 'bad-tok' }, error: null });

    await tokenBlocklist.isRevoked('bad-tok');

    expect(tokenBlocklist.cacheStats.revokedSize).toBe(1);
  });

  // --- Fail-closed with in-memory cache fallback ---

  it('should return true on DB error when token is in revoked cache (fail-closed, cache hit)', async () => {
    // First, successfully revoke a token so it lands in the cache
    mockUpsert.mockResolvedValue({ error: null });
    await tokenBlocklist.revoke('revoked-tok', Math.floor(Date.now() / 1000) + 3600);

    // Now simulate a DB failure on isRevoked
    const supaErr = { message: 'connection refused', code: '500' };
    mockEq.mockReturnValue({ maybeSingle: mockMaybeSingle });
    mockSelectChain.mockReturnValue({ eq: mockEq });
    mockMaybeSingle.mockResolvedValue({ data: null, error: supaErr });

    const result = await tokenBlocklist.isRevoked('revoked-tok');

    expect(result).toBe(true);
    expect(logger.warn).toHaveBeenCalledWith(
      expect.objectContaining({ err: supaErr }),
      'Token blocklist DB lookup failed – using in-memory cache fallback'
    );
  });

  it('should return false on DB error when token is in known-good cache', async () => {
    // First, establish the token as known-good via a successful DB lookup
    mockEq.mockReturnValue({ maybeSingle: mockMaybeSingle });
    mockSelectChain.mockReturnValue({ eq: mockEq });
    mockMaybeSingle.mockResolvedValue({ data: null, error: null });
    await tokenBlocklist.isRevoked('good-tok');

    // Now simulate a DB failure
    const supaErr = { message: 'timeout', code: '500' };
    mockMaybeSingle.mockResolvedValue({ data: null, error: supaErr });

    const result = await tokenBlocklist.isRevoked('good-tok');

    expect(result).toBe(false);
  });

  it('should fail closed (return true) on DB error when token is not in any cache', async () => {
    const supaErr = { message: 'connection refused', code: '500' };
    mockEq.mockReturnValue({ maybeSingle: mockMaybeSingle });
    mockSelectChain.mockReturnValue({ eq: mockEq });
    mockMaybeSingle.mockResolvedValue({ data: null, error: supaErr });

    const result = await tokenBlocklist.isRevoked('unknown-tok');

    expect(result).toBe(true);
    expect(logger.warn).toHaveBeenCalledWith(
      expect.objectContaining({ err: supaErr }),
      'Token blocklist DB lookup failed – using in-memory cache fallback'
    );
    expect(logger.warn).toHaveBeenCalledWith(
      expect.objectContaining({ token: expect.stringContaining('unknown-') }),
      'Token not found in any cache during DB outage – failing closed'
    );
  });
});

describe('TokenBlocklist.clearCaches', () => {
  it('should clear both in-memory caches', async () => {
    // Populate revoked cache
    mockUpsert.mockResolvedValue({ error: null });
    await tokenBlocklist.revoke('tok-a', Math.floor(Date.now() / 1000) + 3600);

    // Populate known-good cache
    mockEq.mockReturnValue({ maybeSingle: mockMaybeSingle });
    mockSelectChain.mockReturnValue({ eq: mockEq });
    mockMaybeSingle.mockResolvedValue({ data: null, error: null });
    await tokenBlocklist.isRevoked('tok-b');

    expect(tokenBlocklist.cacheStats.revokedSize).toBeGreaterThan(0);
    expect(tokenBlocklist.cacheStats.knownGoodSize).toBeGreaterThan(0);

    tokenBlocklist.clearCaches();

    expect(tokenBlocklist.cacheStats.revokedSize).toBe(0);
    expect(tokenBlocklist.cacheStats.knownGoodSize).toBe(0);
  });
});
