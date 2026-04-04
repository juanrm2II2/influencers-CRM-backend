import { Request, Response, NextFunction } from 'express';
import {
  validateSearch,
  validateBulkSearch,
  validateUpdate,
  validateOutreach,
  validateIdParam,
} from '../../../src/middleware/validate';

function mockReq(body?: unknown, params?: Record<string, string>): Partial<Request> {
  return {
    body,
    params: params ?? {},
  } as Partial<Request>;
}

function mockRes(): Partial<Response> {
  const res: Partial<Response> = {};
  res.status = jest.fn().mockReturnValue(res);
  res.json = jest.fn().mockReturnValue(res);
  return res;
}

describe('validateSearch', () => {
  let next: NextFunction;
  beforeEach(() => { next = jest.fn(); });

  it('should call next() for valid search input', () => {
    const req = mockReq({ handle: 'testuser', platform: 'tiktok' }) as Request;
    const res = mockRes() as Response;

    validateSearch(req, res, next);

    expect(next).toHaveBeenCalled();
    expect(res.status).not.toHaveBeenCalled();
  });

  it('should return 400 when handle is missing', () => {
    const req = mockReq({ platform: 'tiktok' }) as Request;
    const res = mockRes() as Response;

    validateSearch(req, res, next);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(next).not.toHaveBeenCalled();
  });

  it('should return 400 when handle is empty string', () => {
    const req = mockReq({ handle: '', platform: 'tiktok' }) as Request;
    const res = mockRes() as Response;

    validateSearch(req, res, next);

    expect(res.status).toHaveBeenCalledWith(400);
  });

  it('should return 400 when handle is whitespace only', () => {
    const req = mockReq({ handle: '   ', platform: 'tiktok' }) as Request;
    const res = mockRes() as Response;

    validateSearch(req, res, next);

    expect(res.status).toHaveBeenCalledWith(400);
  });

  it('should return 400 when handle exceeds max length', () => {
    const req = mockReq({ handle: 'a'.repeat(201), platform: 'tiktok' }) as Request;
    const res = mockRes() as Response;

    validateSearch(req, res, next);

    expect(res.status).toHaveBeenCalledWith(400);
  });

  it('should return 400 when platform is missing', () => {
    const req = mockReq({ handle: 'testuser' }) as Request;
    const res = mockRes() as Response;

    validateSearch(req, res, next);

    expect(res.status).toHaveBeenCalledWith(400);
  });

  it('should return 400 when platform is invalid', () => {
    const req = mockReq({ handle: 'testuser', platform: 'facebook' }) as Request;
    const res = mockRes() as Response;

    validateSearch(req, res, next);

    expect(res.status).toHaveBeenCalledWith(400);
  });

  it('should accept all valid platforms', () => {
    for (const platform of ['tiktok', 'instagram', 'youtube', 'twitter']) {
      const req = mockReq({ handle: 'user', platform }) as Request;
      const res = mockRes() as Response;
      const n = jest.fn();

      validateSearch(req, res, n);

      expect(n).toHaveBeenCalled();
    }
  });

  it('should return 400 when body is null', () => {
    const req = mockReq(null) as Request;
    const res = mockRes() as Response;

    validateSearch(req, res, next);

    expect(res.status).toHaveBeenCalledWith(400);
  });
});

describe('validateBulkSearch', () => {
  let next: NextFunction;
  beforeEach(() => { next = jest.fn(); });

  it('should call next() for valid bulk search input', () => {
    const req = mockReq({ handles: ['user1', 'user2'], platform: 'instagram' }) as Request;
    const res = mockRes() as Response;

    validateBulkSearch(req, res, next);

    expect(next).toHaveBeenCalled();
  });

  it('should return 400 when handles is not an array', () => {
    const req = mockReq({ handles: 'user1', platform: 'tiktok' }) as Request;
    const res = mockRes() as Response;

    validateBulkSearch(req, res, next);

    expect(res.status).toHaveBeenCalledWith(400);
  });

  it('should return 400 when handles array is empty', () => {
    const req = mockReq({ handles: [], platform: 'tiktok' }) as Request;
    const res = mockRes() as Response;

    validateBulkSearch(req, res, next);

    expect(res.status).toHaveBeenCalledWith(400);
  });

  it('should return 400 when handles exceeds maximum (50)', () => {
    const handles = Array.from({ length: 51 }, (_, i) => `user${i}`);
    const req = mockReq({ handles, platform: 'tiktok' }) as Request;
    const res = mockRes() as Response;

    validateBulkSearch(req, res, next);

    expect(res.status).toHaveBeenCalledWith(400);
  });

  it('should return 400 when a handle in array is empty', () => {
    const req = mockReq({ handles: ['user1', ''], platform: 'tiktok' }) as Request;
    const res = mockRes() as Response;

    validateBulkSearch(req, res, next);

    expect(res.status).toHaveBeenCalledWith(400);
  });

  it('should return 400 when a handle exceeds max length', () => {
    const req = mockReq({ handles: ['a'.repeat(201)], platform: 'tiktok' }) as Request;
    const res = mockRes() as Response;

    validateBulkSearch(req, res, next);

    expect(res.status).toHaveBeenCalledWith(400);
  });

  it('should return 400 for invalid platform in bulk search', () => {
    const req = mockReq({ handles: ['user1'], platform: 'linkedin' }) as Request;
    const res = mockRes() as Response;

    validateBulkSearch(req, res, next);

    expect(res.status).toHaveBeenCalledWith(400);
  });

  it('should accept exactly 50 handles', () => {
    const handles = Array.from({ length: 50 }, (_, i) => `user${i}`);
    const req = mockReq({ handles, platform: 'tiktok' }) as Request;
    const res = mockRes() as Response;

    validateBulkSearch(req, res, next);

    expect(next).toHaveBeenCalled();
  });
});

describe('validateUpdate', () => {
  let next: NextFunction;
  beforeEach(() => { next = jest.fn(); });

  it('should call next() for valid update with status', () => {
    const req = mockReq({ status: 'active' }) as Request;
    const res = mockRes() as Response;

    validateUpdate(req, res, next);

    expect(next).toHaveBeenCalled();
  });

  it('should call next() for valid update with niche', () => {
    const req = mockReq({ niche: 'tech' }) as Request;
    const res = mockRes() as Response;

    validateUpdate(req, res, next);

    expect(next).toHaveBeenCalled();
  });

  it('should call next() for valid update with notes', () => {
    const req = mockReq({ notes: 'Some notes' }) as Request;
    const res = mockRes() as Response;

    validateUpdate(req, res, next);

    expect(next).toHaveBeenCalled();
  });

  it('should return 400 for invalid status', () => {
    const req = mockReq({ status: 'unknown' }) as Request;
    const res = mockRes() as Response;

    validateUpdate(req, res, next);

    expect(res.status).toHaveBeenCalledWith(400);
  });

  it('should accept all valid statuses', () => {
    for (const status of ['prospect', 'contacted', 'negotiating', 'active', 'declined']) {
      const req = mockReq({ status }) as Request;
      const res = mockRes() as Response;
      const n = jest.fn();

      validateUpdate(req, res, n);

      expect(n).toHaveBeenCalled();
    }
  });

  it('should return 400 when niche exceeds max length', () => {
    const req = mockReq({ niche: 'x'.repeat(5001) }) as Request;
    const res = mockRes() as Response;

    validateUpdate(req, res, next);

    expect(res.status).toHaveBeenCalledWith(400);
  });

  it('should return 400 when notes exceeds max length', () => {
    const req = mockReq({ notes: 'x'.repeat(5001) }) as Request;
    const res = mockRes() as Response;

    validateUpdate(req, res, next);

    expect(res.status).toHaveBeenCalledWith(400);
  });

  it('should call next() when body is empty (no fields to validate)', () => {
    const req = mockReq({}) as Request;
    const res = mockRes() as Response;

    validateUpdate(req, res, next);

    expect(next).toHaveBeenCalled();
  });
});

describe('validateOutreach', () => {
  let next: NextFunction;
  beforeEach(() => { next = jest.fn(); });

  it('should call next() for valid outreach input', () => {
    const req = mockReq({
      channel: 'email',
      contact_date: '2025-01-15T00:00:00.000Z',
      message_sent: 'Hello!',
    }) as Request;
    const res = mockRes() as Response;

    validateOutreach(req, res, next);

    expect(next).toHaveBeenCalled();
  });

  it('should call next() for empty body (all fields optional)', () => {
    const req = mockReq({}) as Request;
    const res = mockRes() as Response;

    validateOutreach(req, res, next);

    expect(next).toHaveBeenCalled();
  });

  it('should return 400 for invalid channel', () => {
    const req = mockReq({ channel: 'whatsapp' }) as Request;
    const res = mockRes() as Response;

    validateOutreach(req, res, next);

    expect(res.status).toHaveBeenCalledWith(400);
  });

  it('should accept all valid channels', () => {
    for (const channel of ['email', 'dm', 'telegram']) {
      const req = mockReq({ channel }) as Request;
      const res = mockRes() as Response;
      const n = jest.fn();

      validateOutreach(req, res, n);

      expect(n).toHaveBeenCalled();
    }
  });

  it('should return 400 for invalid contact_date', () => {
    const req = mockReq({ contact_date: 'not-a-date' }) as Request;
    const res = mockRes() as Response;

    validateOutreach(req, res, next);

    expect(res.status).toHaveBeenCalledWith(400);
  });

  it('should return 400 for invalid follow_up_date', () => {
    const req = mockReq({ follow_up_date: 'invalid' }) as Request;
    const res = mockRes() as Response;

    validateOutreach(req, res, next);

    expect(res.status).toHaveBeenCalledWith(400);
  });

  it('should return 400 when message_sent exceeds max length', () => {
    const req = mockReq({ message_sent: 'x'.repeat(5001) }) as Request;
    const res = mockRes() as Response;

    validateOutreach(req, res, next);

    expect(res.status).toHaveBeenCalledWith(400);
  });

  it('should return 400 when response exceeds max length', () => {
    const req = mockReq({ response: 'x'.repeat(5001) }) as Request;
    const res = mockRes() as Response;

    validateOutreach(req, res, next);

    expect(res.status).toHaveBeenCalledWith(400);
  });
});

describe('validateIdParam', () => {
  let next: NextFunction;
  beforeEach(() => { next = jest.fn(); });

  it('should call next() for valid UUID', () => {
    const req = mockReq(undefined, { id: '550e8400-e29b-41d4-a716-446655440000' }) as Request;
    const res = mockRes() as Response;

    validateIdParam(req, res, next);

    expect(next).toHaveBeenCalled();
  });

  it('should return 400 for missing id param', () => {
    const req = mockReq(undefined, {}) as Request;
    const res = mockRes() as Response;

    validateIdParam(req, res, next);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith({ error: 'id must be a valid UUID' });
  });

  it('should return 400 for invalid UUID format', () => {
    const req = mockReq(undefined, { id: 'not-a-uuid' }) as Request;
    const res = mockRes() as Response;

    validateIdParam(req, res, next);

    expect(res.status).toHaveBeenCalledWith(400);
  });

  it('should return 400 for SQL injection attempt in id', () => {
    const req = mockReq(undefined, { id: "'; DROP TABLE influencers;--" }) as Request;
    const res = mockRes() as Response;

    validateIdParam(req, res, next);

    expect(res.status).toHaveBeenCalledWith(400);
  });

  it('should return 400 for UUID with extra characters', () => {
    const req = mockReq(undefined, { id: '550e8400-e29b-41d4-a716-446655440000-extra' }) as Request;
    const res = mockRes() as Response;

    validateIdParam(req, res, next);

    expect(res.status).toHaveBeenCalledWith(400);
  });

  it('should accept uppercase UUIDs', () => {
    const req = mockReq(undefined, { id: '550E8400-E29B-41D4-A716-446655440000' }) as Request;
    const res = mockRes() as Response;

    validateIdParam(req, res, next);

    expect(next).toHaveBeenCalled();
  });
});
