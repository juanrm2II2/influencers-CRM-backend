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

  it('should return false and warn on Supabase error (fail-open)', async () => {
    const supaErr = { message: 'connection refused', code: '500' };
    mockEq.mockReturnValue({ maybeSingle: mockMaybeSingle });
    mockSelectChain.mockReturnValue({ eq: mockEq });
    mockMaybeSingle.mockResolvedValue({ data: null, error: supaErr });

    const result = await tokenBlocklist.isRevoked('tok-err');

    expect(result).toBe(false);
    expect(logger.warn).toHaveBeenCalledWith(
      expect.objectContaining({ err: supaErr }),
      'Token blocklist lookup failed – proceeding'
    );
  });
});
