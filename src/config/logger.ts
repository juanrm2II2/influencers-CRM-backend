import pino from 'pino';
import { env } from './env';

/**
 * Structured JSON logger. Fields that may contain secrets or PII are redacted.
 * Keep this list in sync with any new sensitive request/response shapes.
 */
export const logger = pino({
  level: env().LOG_LEVEL,
  base: { service: 'influencers-crm-backend' },
  timestamp: pino.stdTimeFunctions.isoTime,
  redact: {
    paths: [
      'req.headers.authorization',
      'req.headers.cookie',
      'req.headers["x-api-key"]',
      'req.body.password',
      'req.body.apiKey',
      'req.body.api_key',
      'req.body.token',
      'req.body.refreshToken',
      'req.body.refresh_token',
      'req.body.kyc',
      '*.password',
      '*.apiKey',
      '*.api_key',
      '*.token',
      '*.secret',
      'pii.*',
    ],
    censor: '[REDACTED]',
  },
});

export type Logger = typeof logger;
