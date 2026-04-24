import { Request, Response, NextFunction } from 'express';
import { validateListQuery } from '../../../src/middleware/validate';

function makeReq(query: Record<string, unknown>): Request {
  return { query } as unknown as Request;
}
function makeRes(): Response {
  const res = {} as Response;
  res.status = jest.fn().mockReturnValue(res);
  res.json = jest.fn().mockReturnValue(res);
  return res;
}

describe('validateListQuery (audit M6)', () => {
  let next: NextFunction;

  beforeEach(() => {
    next = jest.fn();
  });

  it('accepts an empty query string', () => {
    const req = makeReq({});
    const res = makeRes();
    validateListQuery(req, res, next);
    expect(next).toHaveBeenCalled();
    expect(res.status).not.toHaveBeenCalled();
  });

  it('accepts known platform / status / numeric paging', () => {
    const req = makeReq({
      platform: 'tiktok',
      status: 'active',
      page: '1',
      limit: '50',
      min_followers: '100',
    });
    const res = makeRes();
    validateListQuery(req, res, next);
    expect(next).toHaveBeenCalled();
  });

  it.each([
    ['platform', { platform: 'myspace' }],
    ['status', { status: 'pending' }],
    ['page', { page: '0' }],
    ['page (negative)', { page: '-3' }],
    ['page (non-integer)', { page: '1.5' }],
    ['limit (zero)', { limit: '0' }],
    ['limit (>100)', { limit: '101' }],
    ['min_followers (negative)', { min_followers: '-1' }],
    ['min_followers (non-numeric)', { min_followers: 'abc' }],
  ])('rejects invalid %s', (_label, query) => {
    const req = makeReq(query as Record<string, unknown>);
    const res = makeRes();
    validateListQuery(req, res, next);
    expect(res.status).toHaveBeenCalledWith(400);
    expect(next).not.toHaveBeenCalled();
  });
});
