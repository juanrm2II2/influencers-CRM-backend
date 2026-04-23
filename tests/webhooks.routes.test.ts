import request from 'supertest';
import app from '../src/app';

describe('webhooks routes', () => {
  it('POST /webhooks/provider returns 200 for basic payload', async () => {
    const res = await request(app)
      .post('/webhooks/provider')
      .send({ event: 'test', data: { ok: true } });

    expect(res.status).toBe(200);
  });

  it('handles missing body gracefully', async () => {
    const res = await request(app)
      .post('/webhooks/provider')
      .send({});

    expect([200, 400]).toContain(res.status);
  });
});
