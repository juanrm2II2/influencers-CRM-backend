import { sanitizeObject } from '../../../src/middleware/sanitize';

describe('sanitizeObject — control-character + NFKC handling (audit L4)', () => {
  it('strips ASCII control characters', () => {
    const input = { note: 'hello\u0000\u0007\u001Fworld' };
    expect(sanitizeObject(input)).toEqual({ note: 'helloworld' });
  });

  it('strips zero-width and bidi-override characters', () => {
    const input = { note: 'paypal\u200B.com\u202E' };
    const out = sanitizeObject(input);
    expect((out as { note: string }).note).toBe('paypal.com');
  });

  it('NFKC-normalises composite Unicode forms', () => {
    // U+FB01 (ﬁ ligature) → "fi"  under NFKC
    const input = { note: 'ﬁnd' };
    expect(sanitizeObject(input)).toEqual({ note: 'find' });
  });

  it('caps recursion depth so deeply-nested input cannot stack-overflow', () => {
    let nested: Record<string, unknown> = { v: 'leaf' };
    for (let i = 0; i < 50; i++) nested = { child: nested };
    const out = sanitizeObject(nested);
    // Depth above 16 must be truncated to {}.
    let cur: unknown = out;
    let depth = 0;
    while (cur && typeof cur === 'object' && (cur as Record<string, unknown>).child) {
      cur = (cur as Record<string, unknown>).child;
      depth++;
    }
    expect(depth).toBeLessThanOrEqual(17);
  });

  it('preserves tabs / newlines / carriage returns (whitespace control chars)', () => {
    const input = { note: 'line-1\nline-2\tindented\r\nline-3' };
    expect(sanitizeObject(input)).toEqual({
      note: 'line-1\nline-2\tindented\r\nline-3',
    });
  });
});
