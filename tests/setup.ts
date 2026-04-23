// Test environment defaults. Individual tests can override via process.env.
process.env.NODE_ENV = 'test';
process.env.PORT = process.env.PORT ?? '0';
process.env.LOG_LEVEL = process.env.LOG_LEVEL ?? 'silent';
process.env.CORS_ORIGINS = process.env.CORS_ORIGINS ?? 'http://localhost:3000';
process.env.SUPABASE_URL = process.env.SUPABASE_URL ?? 'https://example.supabase.co';
process.env.SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY ?? 'test-anon-key';
process.env.SUPABASE_SERVICE_ROLE_KEY =
  process.env.SUPABASE_SERVICE_ROLE_KEY ?? 'test-service-role-key';
process.env.SUPABASE_JWT_SECRET =
  process.env.SUPABASE_JWT_SECRET ?? 'test-jwt-secret-at-least-32-characters-long';
process.env.SCRAPECREATORS_API_KEY =
  process.env.SCRAPECREATORS_API_KEY ?? 'test-scrapecreators-key';
process.env.SCRAPECREATORS_BASE_URL =
  process.env.SCRAPECREATORS_BASE_URL ?? 'https://api.scrapecreators.com';
process.env.AUDIT_HMAC_SECRET =
  process.env.AUDIT_HMAC_SECRET ?? 'test-audit-hmac-secret-at-least-32-chars';
process.env.KYC_ENCRYPTION_KEY = process.env.KYC_ENCRYPTION_KEY ?? '0'.repeat(64); // 32 bytes hex
process.env.RATE_LIMIT_WINDOW_MS = process.env.RATE_LIMIT_WINDOW_MS ?? '60000';
process.env.RATE_LIMIT_MAX = process.env.RATE_LIMIT_MAX ?? '1000';
