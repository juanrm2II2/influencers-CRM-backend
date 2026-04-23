<<<<<<< HEAD
import type { NextFunction, Request, Response } from 'express';
import type { ZodTypeAny } from 'zod';

/**
 * Generic request-validation middleware. Each section (body/query/params)
 * is validated independently and the request object is replaced with the
 * parsed/coerced result so downstream handlers get typed, trusted input.
 */
export function validate(schemas: { body?: ZodTypeAny; query?: ZodTypeAny; params?: ZodTypeAny }) {
  return (req: Request, _res: Response, next: NextFunction): void => {
    try {
      if (schemas.body) {
        req.body = schemas.body.parse(req.body);
      }
      if (schemas.query) {
        // Express query object is not mutable via assignment in v5-compatible
        // typings, so we replace with Object.defineProperty semantics.
        const parsed = schemas.query.parse(req.query);
        Object.keys(req.query).forEach((k) => delete (req.query as Record<string, unknown>)[k]);
        Object.assign(req.query, parsed);
      }
      if (schemas.params) {
        req.params = schemas.params.parse(req.params);
      }
      next();
    } catch (err) {
      next(err);
    }
  };
=======
import { Request, Response, NextFunction } from 'express';

/**
 * Lightweight runtime input validation helpers.
 *
 * Each factory returns an Express middleware that validates `req.body`
 * and short-circuits with a 400 response on failure.
 */

const VALID_PLATFORMS = ['tiktok', 'instagram', 'youtube', 'twitter'] as const;
const VALID_STATUSES = ['prospect', 'contacted', 'negotiating', 'active', 'declined'] as const;
const VALID_CHANNELS = ['email', 'dm', 'telegram'] as const;

const MAX_BULK_HANDLES = 50;
const MAX_HANDLE_LENGTH = 200;
const MAX_TEXT_LENGTH = 5000;

function isNonEmptyString(val: unknown): val is string {
  return typeof val === 'string' && val.trim().length > 0;
}

/** POST /api/influencers/search */
export function validateSearch(req: Request, res: Response, next: NextFunction): void {
  const { handle, platform } = req.body ?? {};

  if (!isNonEmptyString(handle)) {
    res.status(400).json({ error: 'handle is required and must be a non-empty string' });
    return;
  }
  if (handle.length > MAX_HANDLE_LENGTH) {
    res.status(400).json({ error: `handle must not exceed ${MAX_HANDLE_LENGTH} characters` });
    return;
  }
  if (!isNonEmptyString(platform) || !VALID_PLATFORMS.includes(platform as typeof VALID_PLATFORMS[number])) {
    res.status(400).json({ error: `platform must be one of: ${VALID_PLATFORMS.join(', ')}` });
    return;
  }

  next();
}

/** POST /api/influencers/bulk-search */
export function validateBulkSearch(req: Request, res: Response, next: NextFunction): void {
  const { handles, platform } = req.body ?? {};

  if (!Array.isArray(handles) || handles.length === 0) {
    res.status(400).json({ error: 'handles must be a non-empty array' });
    return;
  }
  if (handles.length > MAX_BULK_HANDLES) {
    res.status(400).json({ error: `bulk search is limited to ${MAX_BULK_HANDLES} handles per request` });
    return;
  }
  for (const h of handles) {
    if (!isNonEmptyString(h)) {
      res.status(400).json({ error: 'each handle must be a non-empty string' });
      return;
    }
    if (h.length > MAX_HANDLE_LENGTH) {
      res.status(400).json({ error: `each handle must not exceed ${MAX_HANDLE_LENGTH} characters` });
      return;
    }
  }
  if (!isNonEmptyString(platform) || !VALID_PLATFORMS.includes(platform as typeof VALID_PLATFORMS[number])) {
    res.status(400).json({ error: `platform must be one of: ${VALID_PLATFORMS.join(', ')}` });
    return;
  }

  next();
}

/** PATCH /api/influencers/:id */
export function validateUpdate(req: Request, res: Response, next: NextFunction): void {
  const { status, niche, notes } = req.body ?? {};

  if (status !== undefined && !VALID_STATUSES.includes(status)) {
    res.status(400).json({ error: `status must be one of: ${VALID_STATUSES.join(', ')}` });
    return;
  }
  if (niche !== undefined && (typeof niche !== 'string' || niche.length > MAX_TEXT_LENGTH)) {
    res.status(400).json({ error: `niche must be a string of at most ${MAX_TEXT_LENGTH} characters` });
    return;
  }
  if (notes !== undefined && (typeof notes !== 'string' || notes.length > MAX_TEXT_LENGTH)) {
    res.status(400).json({ error: `notes must be a string of at most ${MAX_TEXT_LENGTH} characters` });
    return;
  }

  next();
}

/** POST /api/influencers/:id/outreach */
export function validateOutreach(req: Request, res: Response, next: NextFunction): void {
  const { channel, contact_date, follow_up_date, message_sent, response } = req.body ?? {};

  if (channel !== undefined && !VALID_CHANNELS.includes(channel)) {
    res.status(400).json({ error: `channel must be one of: ${VALID_CHANNELS.join(', ')}` });
    return;
  }

  // Validate ISO 8601 date strings
  if (contact_date !== undefined && isNaN(Date.parse(contact_date))) {
    res.status(400).json({ error: 'contact_date must be a valid date string' });
    return;
  }
  if (follow_up_date !== undefined && isNaN(Date.parse(follow_up_date))) {
    res.status(400).json({ error: 'follow_up_date must be a valid date string' });
    return;
  }

  if (message_sent !== undefined && (typeof message_sent !== 'string' || message_sent.length > MAX_TEXT_LENGTH)) {
    res.status(400).json({ error: `message_sent must be a string of at most ${MAX_TEXT_LENGTH} characters` });
    return;
  }
  if (response !== undefined && (typeof response !== 'string' || response.length > MAX_TEXT_LENGTH)) {
    res.status(400).json({ error: `response must be a string of at most ${MAX_TEXT_LENGTH} characters` });
    return;
  }

  next();
}

/** Validates UUID path parameters to prevent injection */
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function validateIdParam(req: Request, res: Response, next: NextFunction): void {
  const id = req.params.id as string | undefined;

  if (!id || !UUID_RE.test(id)) {
    res.status(400).json({ error: 'id must be a valid UUID' });
    return;
  }

  next();
}

// ---------------------------------------------------------------------------
// Privacy / GDPR validators
// ---------------------------------------------------------------------------

const VALID_CONSENT_TYPES = ['data_processing', 'marketing', 'analytics', 'third_party_sharing'] as const;
const VALID_DSAR_TYPES = ['access', 'erasure', 'export'] as const;
const VALID_DSAR_STATUSES = ['pending', 'processing', 'completed', 'rejected'] as const;

/** POST /api/privacy/consent */
export function validateConsent(req: Request, res: Response, next: NextFunction): void {
  const { consent_type, granted } = req.body ?? {};

  if (!consent_type || !VALID_CONSENT_TYPES.includes(consent_type)) {
    res.status(400).json({
      error: `consent_type must be one of: ${VALID_CONSENT_TYPES.join(', ')}`,
    });
    return;
  }

  if (typeof granted !== 'boolean') {
    res.status(400).json({ error: 'granted must be a boolean' });
    return;
  }

  next();
}

/** POST /api/privacy/requests */
export function validateDsarRequest(req: Request, res: Response, next: NextFunction): void {
  const { request_type } = req.body ?? {};

  if (!request_type || !VALID_DSAR_TYPES.includes(request_type)) {
    res.status(400).json({
      error: `request_type must be one of: ${VALID_DSAR_TYPES.join(', ')}`,
    });
    return;
  }

  next();
}

/** PATCH /api/privacy/requests/:id */
export function validateDsarUpdate(req: Request, res: Response, next: NextFunction): void {
  const { status, notes } = req.body ?? {};

  if (!status || !VALID_DSAR_STATUSES.includes(status)) {
    res.status(400).json({
      error: `status must be one of: ${VALID_DSAR_STATUSES.join(', ')}`,
    });
    return;
  }

  if (notes !== undefined && (typeof notes !== 'string' || notes.length > MAX_TEXT_LENGTH)) {
    res.status(400).json({
      error: `notes must be a string of at most ${MAX_TEXT_LENGTH} characters`,
    });
    return;
  }

  next();
>>>>>>> 17ef3c073da08a2589cd477774c945045b4ff8fd
}
