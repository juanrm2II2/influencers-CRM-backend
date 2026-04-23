import { sanitizeObject } from '../../../src/middleware/sanitize';

/**
 * Helper: checks that a key is NOT present as an own property.
 * We use Object.keys() because toHaveProperty() traverses the prototype
 * chain and would always find __proto__ / constructor on regular objects.
 */
function expectNoOwnKey(obj: Record<string, unknown>, key: string) {
  expect(Object.keys(obj)).not.toContain(key);
}

describe('sanitizeObject', () => {
  describe('Prototype Pollution Protection', () => {
    it('should strip __proto__ key from top-level object', () => {
      const raw = Object.create(null) as Record<string, unknown>;
      raw['name'] = 'safe';
      raw['__proto__'] = { admin: true };

      const result = sanitizeObject(raw);
      expectNoOwnKey(result, '__proto__');
      expect(result).toHaveProperty('name', 'safe');
    });

    it('should strip constructor key from top-level object', () => {
      const raw = Object.create(null) as Record<string, unknown>;
      raw['constructor'] = { prototype: { isAdmin: true } };
      const result = sanitizeObject(raw);
      expectNoOwnKey(result, 'constructor');
    });

    it('should strip prototype key from top-level object', () => {
      const raw = Object.create(null) as Record<string, unknown>;
      raw['prototype'] = { isAdmin: true };
      const result = sanitizeObject(raw);
      expectNoOwnKey(result, 'prototype');
    });

    it('should strip dangerous keys from nested objects', () => {
      const nested = Object.create(null) as Record<string, unknown>;
      nested['__proto__'] = { admin: true };
      nested['constructor'] = { prototype: {} };
      nested['prototype'] = { polluted: true };
      nested['safe'] = 'value';

      const raw: Record<string, unknown> = { name: 'safe', nested };
      const result = sanitizeObject(raw);
      const out = result['nested'] as Record<string, unknown>;
      expectNoOwnKey(out, '__proto__');
      expectNoOwnKey(out, 'constructor');
      expectNoOwnKey(out, 'prototype');
      expect(out).toHaveProperty('safe', 'value');
    });

    it('should strip dangerous keys from objects inside arrays', () => {
      const item0 = Object.create(null) as Record<string, unknown>;
      item0['__proto__'] = { admin: true };
      item0['name'] = 'ok';

      const item1 = Object.create(null) as Record<string, unknown>;
      item1['constructor'] = { prototype: {} };
      item1['value'] = 'safe';

      const raw: Record<string, unknown> = { items: [item0, item1] };
      const result = sanitizeObject(raw);
      const items = result['items'] as Record<string, unknown>[];
      expectNoOwnKey(items[0], '__proto__');
      expect(items[0]).toHaveProperty('name', 'ok');
      expectNoOwnKey(items[1], 'constructor');
      expect(items[1]).toHaveProperty('value', 'safe');
    });

    it('should not pollute Object.prototype', () => {
      const raw = Object.create(null) as Record<string, unknown>;
      raw['__proto__'] = { polluted: 'yes' };
      raw['constructor'] = { prototype: { polluted: 'yes' } };

      sanitizeObject(raw);

      expect((Object.prototype as Record<string, unknown>)['polluted']).toBeUndefined();
    });

    it('should handle deeply nested prototype pollution attempts', () => {
      const innerC = Object.create(null) as Record<string, unknown>;
      innerC['__proto__'] = { isAdmin: true };
      innerC['valid'] = 'data';

      const raw: Record<string, unknown> = { a: { b: { c: innerC } } };
      const result = sanitizeObject(raw);
      const deep = (result['a'] as Record<string, unknown>)['b'] as Record<string, unknown>;
      const c = deep['c'] as Record<string, unknown>;
      expectNoOwnKey(c, '__proto__');
      expect(c).toHaveProperty('valid', 'data');
    });
  });

  describe('HTML sanitization', () => {
    it('should strip HTML tags from string values', () => {
      const result = sanitizeObject({ name: '<script>alert("xss")</script>' });
      expect(result['name']).not.toContain('<script>');
    });

    it('should preserve safe string values', () => {
      const result = sanitizeObject({ name: 'John Doe' });
      expect(result['name']).toBe('John Doe');
    });

    it('should pass through non-string primitives unchanged', () => {
      const result = sanitizeObject({ count: 42, active: true, empty: null });
      expect(result['count']).toBe(42);
      expect(result['active']).toBe(true);
      expect(result['empty']).toBeNull();
    });
  });
});
