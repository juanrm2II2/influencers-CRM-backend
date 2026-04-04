import pino from 'pino';

/**
 * Structured logger using Pino.
 *
 * - JSON output suitable for log aggregation systems
 * - Supports log levels: fatal, error, warn, info, debug, trace
 * - LOG_LEVEL env var controls verbosity (defaults to 'info')
 */
export const logger = pino({
  level: process.env.LOG_LEVEL ?? 'info',
  ...(process.env.NODE_ENV !== 'production' && {
    transport: {
      target: 'pino/file',
      options: { destination: 1 }, // stdout
    },
  }),
});
