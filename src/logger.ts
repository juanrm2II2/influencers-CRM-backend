import pino from 'pino';

/**
 * Custom Error serializer that emits only the safe metadata fields.
 *
 * The default pino serializer includes the full `stack` plus any properties
 * the Error happens to carry — most notably AxiosError.config.headers
 * (which can contain `x-api-key` / `Authorization` on retried requests),
 * `request`/`response` bodies, and Supabase errors carry connection
 * details.  Aggregation pipelines then retain those secrets indefinitely
 * (audit M9).
 *
 * We deliberately drop everything else and only keep:
 *   - message: human-readable description
 *   - name:    constructor name (e.g. 'AxiosError')
 *   - code:    machine-readable error code (e.g. 'ETIMEDOUT')
 *   - status:  HTTP status (when present, e.g. AxiosError.response.status)
 */
function safeErrSerializer(err: unknown): Record<string, unknown> {
  if (err === null || err === undefined) return { message: String(err) };
  if (typeof err !== 'object') return { message: String(err) };
  const e = err as Record<string, unknown>;
  const out: Record<string, unknown> = {};
  if (typeof e.message === 'string') out.message = e.message;
  if (typeof e.name === 'string') out.name = e.name;
  if (typeof e.code === 'string' || typeof e.code === 'number') out.code = e.code;
  if (typeof e.status === 'number') out.status = e.status;
  // AxiosError nests the HTTP status under .response.status
  const response = e.response as Record<string, unknown> | undefined;
  if (response && typeof response.status === 'number' && out.status === undefined) {
    out.status = response.status;
  }
  return out;
}

/**
 * Structured logger using Pino.
 *
 * - JSON output suitable for log aggregation systems
 * - Supports log levels: fatal, error, warn, info, debug, trace
 * - LOG_LEVEL env var controls verbosity (defaults to 'info')
 * - Redacts well-known secret-bearing paths defensively (audit M9):
 *   raw Authorization / x-api-key headers, AxiosError config / request /
 *   response config headers, and DB connection strings.
 */
export const logger = pino({
  level: process.env.LOG_LEVEL ?? 'info',
  serializers: {
    err: safeErrSerializer,
    error: safeErrSerializer,
  },
  redact: {
    paths: [
      'req.headers.authorization',
      'req.headers["x-api-key"]',
      'req.headers.cookie',
      'res.headers["set-cookie"]',
      // AxiosError payload paths
      'err.config.headers',
      'err.request.headers',
      'err.response.config.headers',
      'err.response.headers',
      'error.config.headers',
      'error.request.headers',
      'error.response.config.headers',
      'error.response.headers',
      // Generic top-level header objects
      'headers.authorization',
      'headers["x-api-key"]',
      // Connection strings / API keys when accidentally logged
      'connectionString',
      'DATABASE_URL',
      'SUPABASE_SERVICE_KEY',
      'SUPABASE_JWT_SECRET',
      'SCRAPECREATORS_API_KEY',
    ],
    censor: '[REDACTED]',
    remove: false,
  },
});
