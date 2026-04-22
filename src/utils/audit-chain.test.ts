import {
  GENESIS_HASH,
  computeRowHash,
  verifyChain,
  type AuditPayload,
  type AuditRow,
} from '../../src/utils/audit-chain';

const SECRET = 'x'.repeat(40);

function payload(overrides: Partial<AuditPayload> = {}): AuditPayload {
  return {
    seq: 1,
    occurred_at: '2026-01-01T00:00:00.000Z',
    actor_id: '00000000-0000-0000-0000-000000000001',
    org_id: '00000000-0000-0000-0000-000000000002',
    action: 'influencers.create',
    entity_type: 'influencer',
    entity_id: '00000000-0000-0000-0000-000000000003',
    context: { b: 2, a: 1 },
    ip: '127.0.0.1',
    user_agent: 'jest',
    ...overrides,
  };
}

function chain(secret: string, payloads: AuditPayload[]): AuditRow[] {
  const rows: AuditRow[] = [];
  let prev = GENESIS_HASH;
  for (const p of payloads) {
    const h = computeRowHash(secret, prev, p);
    rows.push({ ...p, prev_hash: prev, row_hash: h });
    prev = h;
  }
  return rows;
}

describe('audit-chain', () => {
  it('computes a deterministic hash regardless of key order in context', () => {
    const a = computeRowHash(SECRET, GENESIS_HASH, payload({ context: { a: 1, b: 2 } }));
    const b = computeRowHash(SECRET, GENESIS_HASH, payload({ context: { b: 2, a: 1 } }));
    expect(a).toEqual(b);
    expect(a).toMatch(/^[0-9a-f]{64}$/);
  });

  it('produces different hashes for different prev_hash values', () => {
    const other = 'a'.repeat(64);
    const a = computeRowHash(SECRET, GENESIS_HASH, payload());
    const b = computeRowHash(SECRET, other, payload());
    expect(a).not.toEqual(b);
  });

  it('produces different hashes for different secrets', () => {
    const a = computeRowHash(SECRET, GENESIS_HASH, payload());
    const b = computeRowHash('y'.repeat(40), GENESIS_HASH, payload());
    expect(a).not.toEqual(b);
  });

  it('rejects invalid prev_hash format', () => {
    expect(() => computeRowHash(SECRET, 'not-hex', payload())).toThrow();
  });

  it('requires a secret', () => {
    expect(() => computeRowHash('', GENESIS_HASH, payload())).toThrow();
  });

  it('verifyChain accepts an unbroken chain', () => {
    const rows = chain(SECRET, [
      payload({ seq: 1 }),
      payload({ seq: 2, action: 'influencers.update' }),
      payload({ seq: 3, action: 'influencers.delete' }),
    ]);
    expect(verifyChain(SECRET, rows)).toEqual({ ok: true });
  });

  it('verifyChain detects a tampered payload', () => {
    const rows = chain(SECRET, [payload({ seq: 1 }), payload({ seq: 2 })]);
    rows[0].context = { tampered: true };
    const r = verifyChain(SECRET, rows);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.brokenAt).toBe(0);
  });

  it('verifyChain detects a broken prev_hash link', () => {
    const rows = chain(SECRET, [payload({ seq: 1 }), payload({ seq: 2 })]);
    rows[1].prev_hash = 'f'.repeat(64);
    const r = verifyChain(SECRET, rows);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.brokenAt).toBe(1);
  });

  it('verifyChain rejects non-monotonic sequence numbers', () => {
    const rows = chain(SECRET, [payload({ seq: 5 }), payload({ seq: 3 })]);
    const r = verifyChain(SECRET, rows);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toMatch(/monotonic/);
  });

  it('verifyChain with a wrong secret fails', () => {
    const rows = chain(SECRET, [payload({ seq: 1 })]);
    const r = verifyChain('wrong-secret-with-sufficient-length-padding', rows);
    expect(r.ok).toBe(false);
  });
});
