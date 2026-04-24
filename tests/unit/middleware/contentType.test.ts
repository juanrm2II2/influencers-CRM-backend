import { Request, Response, NextFunction } from 'express';
import { enforceJsonContentType } from '../../../src/middleware/contentType';

function makeReq(method: string, headers: Record<string, string> = {}): Request {
  return { method, headers } as unknown as Request;
}
function makeRes(): Response {
  const res = {} as Response;
  res.status = jest.fn().mockReturnValue(res);
  res.json = jest.fn().mockReturnValue(res);
  return res;
}

describe('enforceJsonContentType middleware (audit M2)', () => {
  let next: NextFunction;
  beforeEach(() => {
    next = jest.fn();
  });

  it('passes through GET / DELETE / HEAD / OPTIONS regardless of content-type', () => {
    for (const method of ['GET', 'DELETE', 'HEAD', 'OPTIONS']) {
      const req = makeReq(method, { 'content-type': 'text/plain', 'content-length': '10' });
      const res = makeRes();
      enforceJsonContentType(req, res, next);
    }
    expect(next).toHaveBeenCalledTimes(4);
  });

  it('passes through state-changing requests with no body', () => {
    for (const method of ['POST', 'PATCH', 'PUT']) {
      const req = makeReq(method, {});
      const res = makeRes();
      enforceJsonContentType(req, res, next);
    }
    expect(next).toHaveBeenCalledTimes(3);
  });

  it.each(['application/json', 'application/json; charset=utf-8', 'APPLICATION/JSON'])(
    'accepts state-changing requests with content-type %s',
    (ct) => {
      const req = makeReq('POST', { 'content-type': ct, 'content-length': '5' });
      const res = makeRes();
      enforceJsonContentType(req, res, next);
      expect(next).toHaveBeenCalled();
      expect(res.status).not.toHaveBeenCalled();
    }
  );

  it.each(['text/plain', 'application/x-www-form-urlencoded', 'multipart/form-data'])(
    'rejects state-changing requests with content-type %s with HTTP 415',
    (ct) => {
      const req = makeReq('POST', { 'content-type': ct, 'content-length': '5' });
      const res = makeRes();
      enforceJsonContentType(req, res, next);
      expect(res.status).toHaveBeenCalledWith(415);
      expect(res.json).toHaveBeenCalledWith({
        error: 'Content-Type must be application/json',
      });
      expect(next).not.toHaveBeenCalled();
    }
  );

  it('rejects state-changing requests with a body but no content-type', () => {
    const req = makeReq('POST', { 'content-length': '5' });
    const res = makeRes();
    enforceJsonContentType(req, res, next);
    expect(res.status).toHaveBeenCalledWith(415);
    expect(next).not.toHaveBeenCalled();
  });

  it('treats Transfer-Encoding: chunked as a body for the purposes of the guard', () => {
    const req = makeReq('PUT', {
      'content-type': 'text/plain',
      'transfer-encoding': 'chunked',
    });
    const res = makeRes();
    enforceJsonContentType(req, res, next);
    expect(res.status).toHaveBeenCalledWith(415);
  });
});
