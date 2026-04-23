import crypto from 'node:crypto';

/**
 * Deterministic, canonical JSON stringification.
 *
 * Object keys are sorted, making the output stable regardless of insertion
 * order. This is required for hashing/signing JSON payloads (e.g. audit log
 * chain). Arrays are NOT re-ordered (ordering is semantic).
 */
export function canonicalJSONStringify(value: unknown): string {
  return JSON.stringify(sortValue(value));
}

function sortValue(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(sortValue);
  }
  if (value && typeof value === 'object' && value.constructor === Object) {
    const sorted: Record<string, unknown> = {};
    for (const key of Object.keys(value as Record<string, unknown>).sort()) {
      sorted[key] = sortValue((value as Record<string, unknown>)[key]);
    }
    return sorted;
  }
  return value;
}

export function sha256Hex(input: string | Buffer): string {
  return crypto.createHash('sha256').update(input).digest('hex');
}

export function hmacSha256Hex(key: string | Buffer, input: string | Buffer): string {
  return crypto.createHmac('sha256', key).update(input).digest('hex');
}

/**
 * Timing-safe comparison for secrets (API keys, HMACs). Returns false when
 * lengths differ without leaking timing information.
 */
export function timingSafeEqualHex(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  try {
    return crypto.timingSafeEqual(Buffer.from(a, 'hex'), Buffer.from(b, 'hex'));
  } catch {
    return false;
  }
}
