import { Request, Response, NextFunction } from 'express';
import sanitizeHtml from 'sanitize-html';

/**
 * Strict sanitization options — strip ALL HTML tags and attributes.
 * Only plain text is kept; this is appropriate for an API that stores
 * user-provided text fields (notes, bios, messages, etc.).
 */
const SANITIZE_OPTIONS: sanitizeHtml.IOptions = {
  allowedTags: [],
  allowedAttributes: {},
  disallowedTagsMode: 'discard',
};

/** Keys that must be stripped to prevent prototype pollution attacks. */
const DANGEROUS_KEYS = new Set(['__proto__', 'constructor', 'prototype']);

/**
 * Maximum recursion depth.  A malicious client could otherwise post a
 * deeply-nested object (or one with billions of keys) and stack-overflow
 * the sanitizer (audit L4).
 */
const MAX_DEPTH = 16;

/**
 * Strip ASCII / C0 / C1 control characters and zero-width / bidi-override
 * code points that have legitimately no place in user-supplied text and
 * are routinely used for log-injection / IDN-spoofing / homoglyph
 * attacks.  Then NFKC-normalise so visually-equivalent strings collapse
 * to a canonical form for comparison and storage.
 */
function cleanString(s: string): string {
  // Remove C0 (0x00–0x1F except \t \n \r), DEL (0x7F), and C1 (0x80–0x9F)
  // plus the bidi-override / zero-width / BOM characters most commonly
  // abused for spoofing.
  let cleaned = s
    // eslint-disable-next-line no-control-regex
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F-\u009F]/g, '')
    .replace(/[\u200B-\u200F\u202A-\u202E\u2066-\u2069\uFEFF]/g, '');
  cleaned = sanitizeHtml(cleaned, SANITIZE_OPTIONS);
  try {
    cleaned = cleaned.normalize('NFKC');
  } catch {
    /* leave as-is on the rare engines without NFKC support */
  }
  return cleaned;
}

/**
 * Recursively sanitizes all string values in an object.
 * Strips keys that could lead to prototype pollution.
 */
export function sanitizeObject(
  obj: Record<string, unknown>,
  depth = 0,
): Record<string, unknown> {
  if (depth > MAX_DEPTH) {
    // Refuse to descend further; truncate the subtree.
    return {};
  }
  const result: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(obj)) {
    if (DANGEROUS_KEYS.has(key)) {
      continue;
    }
    if (typeof value === 'string') {
      result[key] = cleanString(value);
    } else if (value !== null && typeof value === 'object' && !Array.isArray(value)) {
      result[key] = sanitizeObject(value as Record<string, unknown>, depth + 1);
    } else if (Array.isArray(value)) {
      result[key] = value.map((item) =>
        typeof item === 'string'
          ? cleanString(item)
          : item !== null && typeof item === 'object'
            ? sanitizeObject(item as Record<string, unknown>, depth + 1)
            : item
      );
    } else {
      result[key] = value;
    }
  }
  return result;
}

/**
 * Express middleware that sanitizes all string fields in `req.body`
 * to prevent stored XSS attacks. Strips all HTML tags and attributes.
 *
 * Should be placed after body parsing and before route handlers.
 */
export function sanitizeBody(
  req: Request,
  _res: Response,
  next: NextFunction
): void {
  if (req.body && typeof req.body === 'object') {
    req.body = sanitizeObject(req.body as Record<string, unknown>);
  }
  next();
}
