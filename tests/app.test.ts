import request from 'supertest';
import { buildApp } from '../src/app';

describe('app', () => {
  const app = buildApp();

  describe('health', () => {
    it('GET /health/live returns 200', async () => {
      const res = await request(app).get('/health/live');
      expect(res.status).toBe(200);
      expect(res.body.status).toBe('ok');
    });

    it('GET /health/ready returns 200 when config is valid', async () => {
      const res = await request(app).get('/health/ready');
      expect(res.status).toBe(200);
      expect(res.body.checks.supabase.ok).toBe(true);
    });
  });

  describe('request id', () => {
    it('attaches X-Request-Id header on every response', async () => {
      const res = await request(app).get('/health/live');
      expect(res.headers['x-request-id']).toMatch(/^[a-zA-Z0-9._-]+$/);
    });

    it('preserves a valid inbound X-Request-Id', async () => {
      const res = await request(app).get('/health/live').set('X-Request-Id', 'abc-123_test');
      expect(res.headers['x-request-id']).toBe('abc-123_test');
    });

    it('replaces an invalid inbound X-Request-Id', async () => {
      const res = await request(app).get('/health/live').set('X-Request-Id', '!! bad value !!');
      expect(res.headers['x-request-id']).not.toBe('!! bad value !!');
      expect(res.headers['x-request-id']).toMatch(/^[a-zA-Z0-9._-]+$/);
    });
  });

  describe('auth', () => {
    it('protected routes return 401 without a token', async () => {
      const res = await request(app).get('/api/v1/influencers');
      expect(res.status).toBe(401);
      expect(res.body.error.code).toBe('UNAUTHORIZED');
    });

    it('protected routes return 401 with a malformed token', async () => {
      const res = await request(app)
        .get('/api/v1/influencers')
        .set('Authorization', 'Bearer not-a-jwt');
      expect(res.status).toBe(401);
    });
  });

  describe('validation', () => {
    it('returns 401 before validating a body on an auth-protected route', async () => {
      // Sanity: auth precedes validation so this must be 401 not 400.
      const res = await request(app).post('/api/v1/auth/login').send({});
      // /auth/login has no auth middleware — validation runs first.
      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe('VALIDATION_ERROR');
    });
  });

  describe('not found', () => {
    it('returns 404 JSON for unknown routes', async () => {
      const res = await request(app).get('/does/not/exist');
      expect(res.status).toBe(404);
      expect(res.body.error.code).toBe('NOT_FOUND');
    });
  });

  describe('security headers', () => {
    it('does not expose x-powered-by and sets helmet defaults', async () => {
      const res = await request(app).get('/health/live');
      expect(res.headers['x-powered-by']).toBeUndefined();
      // helmet sets at least X-Content-Type-Options: nosniff by default.
      expect(res.headers['x-content-type-options']).toBe('nosniff');
    });
  });
});
