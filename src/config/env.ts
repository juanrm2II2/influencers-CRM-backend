import 'dotenv/config';
import { z } from 'zod';

const EnvSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'staging', 'production']).default('development'),
  PORT: z.coerce.number().int().min(0).max(65535).default(8080),
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent']).default('info'),

  CORS_ORIGINS: z
    .string()
    .default('http://localhost:3000')
    .transform((v) =>
      v
        .split(',')
        .map((s) => s.trim())
        .filter((s) => s.length > 0),
    ),

  RATE_LIMIT_WINDOW_MS: z.coerce.number().int().positive().default(60_000),
  RATE_LIMIT_MAX: z.coerce.number().int().positive().default(300),

  SUPABASE_URL: z.string().url(),
  SUPABASE_ANON_KEY: z.string().min(10),
  SUPABASE_SERVICE_ROLE_KEY: z.string().min(10),
  SUPABASE_JWT_SECRET: z.string().min(32, 'SUPABASE_JWT_SECRET must be at least 32 chars'),

  SCRAPECREATORS_BASE_URL: z.string().url().default('https://api.scrapecreators.com'),
  SCRAPECREATORS_API_KEY: z.string().min(1),
  SCRAPECREATORS_CACHE_TTL_SECONDS: z.coerce.number().int().positive().default(86_400),

  AUDIT_HMAC_SECRET: z.string().min(32, 'AUDIT_HMAC_SECRET must be at least 32 chars'),
  KYC_ENCRYPTION_KEY: z
    .string()
    .regex(/^[0-9a-fA-F]{64}$/, 'KYC_ENCRYPTION_KEY must be 32 bytes hex (64 chars)'),

  JOBS_ENABLED: z
    .enum(['true', 'false'])
    .default('true')
    .transform((v) => v === 'true'),
  JOBS_METRICS_REFRESH_CRON: z.string().default('0 3 * * *'),
  JOBS_KYC_EXPIRY_CRON: z.string().default('0 4 * * *'),
  JOBS_AUDIT_VERIFY_CRON: z.string().default('0 5 * * *'),

  SENTRY_DSN: z.string().optional(),
});

export type Env = z.infer<typeof EnvSchema>;

let cached: Env | undefined;

export function loadEnv(source: NodeJS.ProcessEnv = process.env): Env {
  const parsed = EnvSchema.safeParse(source);
  if (!parsed.success) {
    const issues = parsed.error.issues
      .map((i) => `  - ${i.path.join('.')}: ${i.message}`)
      .join('\n');
    throw new Error(`Invalid environment configuration:\n${issues}`);
  }
  return parsed.data;
}

export function env(): Env {
  if (!cached) {
    cached = loadEnv();
  }
  return cached;
}

/** For tests: reset cached env so subsequent `env()` calls re-read process.env. */
export function resetEnvForTesting(): void {
  cached = undefined;
}
