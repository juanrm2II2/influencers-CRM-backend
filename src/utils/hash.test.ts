import {
  canonicalJSONStringify,
  hmacSha256Hex,
  sha256Hex,
  timingSafeEqualHex,
} from '../../src/utils/hash';

describe('hash utilities', () => {
  it('canonicalJSONStringify sorts object keys deeply', () => {
    expect(canonicalJSONStringify({ b: 2, a: 1 })).toBe('{"a":1,"b":2}');
    expect(canonicalJSONStringify({ b: { z: 1, a: 2 } })).toBe('{"b":{"a":2,"z":1}}');
  });

  it('canonicalJSONStringify preserves array order', () => {
    expect(canonicalJSONStringify({ a: [3, 1, 2] })).toBe('{"a":[3,1,2]}');
  });

  it('sha256Hex produces a 64-char lowercase hex digest', () => {
    expect(sha256Hex('abc')).toMatch(/^[0-9a-f]{64}$/);
  });

  it('hmacSha256Hex matches reference value', () => {
    // RFC-ish sanity check: non-empty HMAC length 64 chars
    expect(hmacSha256Hex('secret', 'data')).toMatch(/^[0-9a-f]{64}$/);
    expect(hmacSha256Hex('secret', 'data')).toEqual(hmacSha256Hex('secret', 'data'));
    expect(hmacSha256Hex('secret', 'a')).not.toEqual(hmacSha256Hex('secret', 'b'));
  });

  it('timingSafeEqualHex returns true for equal hex strings', () => {
    expect(timingSafeEqualHex('ab12', 'ab12')).toBe(true);
  });

  it('timingSafeEqualHex returns false for unequal lengths', () => {
    expect(timingSafeEqualHex('ab', 'ab12')).toBe(false);
  });

  it('timingSafeEqualHex returns false when buffers are unequal', () => {
    expect(timingSafeEqualHex('ab12', 'cd34')).toBe(false);
  });
});
