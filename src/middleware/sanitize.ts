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
 * Recursively sanitizes all string values in an object.
 * Strips keys that could lead to prototype pollution.
 */
export function sanitizeObject(obj: Record<string, unknown>): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(obj)) {
    if (DANGEROUS_KEYS.has(key)) {
      continue;
    }
    if (typeof value === 'string') {
      result[key] = sanitizeHtml(value, SANITIZE_OPTIONS);
    } else if (value !== null && typeof value === 'object' && !Array.isArray(value)) {
      result[key] = sanitizeObject(value as Record<string, unknown>);
    } else if (Array.isArray(value)) {
      result[key] = value.map((item) =>
        typeof item === 'string'
          ? sanitizeHtml(item, SANITIZE_OPTIONS)
          : item !== null && typeof item === 'object'
            ? sanitizeObject(item as Record<string, unknown>)
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
