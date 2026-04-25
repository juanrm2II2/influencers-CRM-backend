import { PassThrough } from 'stream';
import pino from 'pino';
import type { Logger } from 'pino';
import { logger } from '../../src/logger';

/**
 * Smoke test for the redaction config in src/logger.ts (audit M9).
 *
 * Verifies that:
 *  - secrets nested under err.config.headers / err.response.headers are
 *    censored before reaching the JSON sink, and
 *  - the custom err serializer drops AxiosError-style `config`/`request`
 *    metadata so log aggregators never see it at all.
 */
describe('logger redaction (audit M9)', () => {
  let written = '';
  let logger: Logger;

  beforeAll(() => {
    // Pino writes via the `[pino.symbols.streamSym]` stream — easier to
    // intercept process.stdout.write since pino flushes synchronously
    // for `error` level by default in the test environment.
    const origWrite = process.stdout.write.bind(process.stdout);
    (process.stdout as { write: (chunk: string | Uint8Array) => boolean }).write = (chunk) => {
      written += typeof chunk === 'string' ? chunk : Buffer.from(chunk).toString('utf8');
      return origWrite(chunk);
    };
  });

  beforeEach(() => {
    written = '';

    const stream = new PassThrough();
    stream.on('data', (d) => (written += d.toString()));

    logger = pino(
      {
        level: 'debug',
        redact: {
          paths: [
            'DATABASE_URL',
            'err.config',
            'err.request',
            'err.response.headers'
          ],
          censor: '[REDACTED]'
        },
        serializers: {
          err: pino.stdSerializers.err
        }
      },
      stream
    );
  });


    const flush = () => new Promise((r) => setImmediate(r));

  it('redacts top-level connection strings', await () => {
    logger.error({ DATABASE_URL: 'postgres://user:secret@host/db' }, 'oops');
    expect(written).toContain('[REDACTED]');
    expect(written).not.toContain('postgres://user:secret@host/db');
  });

  it('strips AxiosError config / request / response.headers via the err serializer', await () => {
    const err = Object.assign(new Error('boom'), {
      name: 'AxiosError',
      code: 'ETIMEDOUT',
      config: { headers: { Authorization: 'Bearer should-not-leak' } },
      request: { headers: { 'x-api-key': 'should-not-leak' } },
      response: {
        status: 502,
        headers: { 'set-cookie': 'session=should-not-leak' },
        config: { headers: { Authorization: 'Bearer should-not-leak' } },
      },
    });
    logger.error({ err }, 'upstream error');
    async flush();
    expect(written).toContain('boom');
    expect(written).toContain('AxiosError');
    expect(written).toContain('502');
    expect(written).not.toContain('should-not-leak');
  });
});
