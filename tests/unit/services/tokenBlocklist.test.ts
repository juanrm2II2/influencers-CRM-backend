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

/* ------------------------------------------------------------------ */
/*  revoke()                                                          */
/* ------------------------------------------------------------------ */
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

  it('should add the token to the revoked cache after successful revoke', async () => {
    mockUpsert.mockResolvedValue({ error: null });
    await tokenBlocklist.revoke('cached-tok', 1700000000);

    const stats = tokenBlocklist.cacheStats();
    expect(stats.revokedSize).toBe(1);
  });
});

/* ------------------------------------------------------------------ */
/*  isRevoked() – normal DB path                                      */
/* ------------------------------------------------------------------ */
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

  it('should populate the revoked cache on DB hit', async () => {
    mockEq.mockReturnValue({ maybeSingle: mockMaybeSingle });
    mockSelectChain.mockReturnValue({ eq: mockEq });
    mockMaybeSingle.mockResolvedValue({ data: { token: 'tok-r' }, error: null });

    await tokenBlocklist.isRevoked('tok-r');

    expect(tokenBlocklist.cacheStats().revokedSize).toBe(1);
    expect(tokenBlocklist.cacheStats().knownGoodSize).toBe(0);
  });

  it('should populate the known-good cache on DB miss', async () => {
    mockEq.mockReturnValue({ maybeSingle: mockMaybeSingle });
    mockSelectChain.mockReturnValue({ eq: mockEq });
    mockMaybeSingle.mockResolvedValue({ data: null, error: null });

    await tokenBlocklist.isRevoked('tok-ok');

    expect(tokenBlocklist.cacheStats().knownGoodSize).toBe(1);
    expect(tokenBlocklist.cacheStats().revokedSize).toBe(0);
  });
});

/* ------------------------------------------------------------------ */
/*  isRevoked() – DB error fallback paths                             */
/* ------------------------------------------------------------------ */
describe('TokenBlocklist.isRevoked – DB error fallback', () => {
  const supaErr = { message: 'connection refused', code: '500' };

  function setupDbError() {
    mockEq.mockReturnValue({ maybeSingle: mockMaybeSingle });
    mockSelectChain.mockReturnValue({ eq: mockEq });
    mockMaybeSingle.mockResolvedValue({ data: null, error: supaErr });
  }

  it('should return true (fail closed) when DB fails and token is in revoked cache', async () => {
    // Pre-populate the revoked cache via a successful revoke call
    mockUpsert.mockResolvedValue({ error: null });
    await tokenBlocklist.revoke('tok-revoked', 9999999999);

    // Now simulate DB error
    setupDbError();

    const result = await tokenBlocklist.isRevoked('tok-revoked');

    expect(result).toBe(true);
    expect(logger.warn).toHaveBeenCalledWith(
      expect.objectContaining({ err: supaErr }),
      'Token blocklist lookup failed – token found in revoked cache',
    );
  });

  it('should return false when DB fails and token is in known-good cache', async () => {
    // Pre-populate the known-good cache via a successful isRevoked call
    mockEq.mockReturnValue({ maybeSingle: mockMaybeSingle });
    mockSelectChain.mockReturnValue({ eq: mockEq });
    mockMaybeSingle.mockResolvedValue({ data: null, error: null });
    await tokenBlocklist.isRevoked('tok-good');

    // Now simulate DB error
    setupDbError();

    const result = await tokenBlocklist.isRevoked('tok-good');

    expect(result).toBe(false);
    expect(logger.warn).toHaveBeenCalledWith(
      expect.objectContaining({ err: supaErr }),
      'Token blocklist lookup failed – token found in known-good cache, allowing',
    );
  });

  it('should return true (fail closed) when DB fails and token is NOT in any cache', async () => {
    setupDbError();

    const result = await tokenBlocklist.isRevoked('tok-unknown-err');

    expect(result).toBe(true);
    expect(logger.warn).toHaveBeenCalledWith(
      expect.objectContaining({ err: supaErr }),
      'Token blocklist lookup failed – failing closed',
    );
  });
});

/* ------------------------------------------------------------------ */
/*  cacheStats() and clearCaches()                                    */
/* ------------------------------------------------------------------ */
describe('TokenBlocklist cache management', () => {
  it('cacheStats should return correct sizes', async () => {
    // Start empty
    expect(tokenBlocklist.cacheStats()).toEqual({ revokedSize: 0, knownGoodSize: 0 });

    // Add a revoked token
    mockUpsert.mockResolvedValue({ error: null });
    await tokenBlocklist.revoke('tok-a', 9999999999);
    expect(tokenBlocklist.cacheStats().revokedSize).toBe(1);

    // Add a known-good token
    mockEq.mockReturnValue({ maybeSingle: mockMaybeSingle });
    mockSelectChain.mockReturnValue({ eq: mockEq });
    mockMaybeSingle.mockResolvedValue({ data: null, error: null });
    await tokenBlocklist.isRevoked('tok-b');
    expect(tokenBlocklist.cacheStats().knownGoodSize).toBe(1);
  });

  it('clearCaches should reset both caches', async () => {
    mockUpsert.mockResolvedValue({ error: null });
    await tokenBlocklist.revoke('tok-c', 9999999999);

    tokenBlocklist.clearCaches();

    expect(tokenBlocklist.cacheStats()).toEqual({ revokedSize: 0, knownGoodSize: 0 });
  });
});
