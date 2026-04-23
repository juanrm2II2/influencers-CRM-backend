# Architecture

## High-level

```
 ┌──────────────────┐        HTTPS         ┌────────────────────┐
 │  Next.js (Vercel)│ ───────────────────▶ │   Express backend  │
 │     frontend     │                      │     (Railway)      │
 └──────────────────┘                      └────────┬───────────┘
                                                    │
                     ┌──────────────────────────────┼────────────────────────┐
                     │                              │                        │
                     ▼                              ▼                        ▼
              ┌────────────┐              ┌──────────────────┐      ┌──────────────┐
              │ Supabase   │              │ ScrapeCreators   │      │ KYC / e-sign │
              │ Postgres + │              │     API          │      │   providers  │
              │ Auth + S3  │              │                  │      │   (webhook)  │
              └────────────┘              └──────────────────┘      └──────────────┘
```

## Request lifecycle

1. Client sends HTTPS request with `Authorization: Bearer <supabase-jwt>` or `X-API-Key: <key>`.
2. Railway load balancer forwards to the Express process; `trust proxy` lets us read the real client IP.
3. Middleware chain (in order):
   - `requestId` — stable `X-Request-Id` (honoured from upstream or minted).
   - `helmet` — security headers.
   - `cors` — allowlist check against `CORS_ORIGINS`.
   - `pino-http` — structured request logging (with redacted PII).
   - `express.json` / `express.urlencoded` — body parsing.
     - Webhooks skip JSON parsing and use `express.raw` so HMAC verification sees the exact bytes.
   - `globalRateLimiter` — per-IP token bucket.
   - `authenticate()` — Supabase JWT (HS256) or hashed API key.
   - `requireRole()` — RBAC check against `user_roles`.
   - `validate({ body, query, params })` — zod schema validation per route.
4. Controller delegates to the service layer. Services call repositories which use the Supabase service client and enforce authorization explicitly.
5. All mutations are wrapped by the audit-log writer (hash chain) before the response is sent.
6. Errors are funneled through the central `errorHandler` which translates `AppError`/`ZodError` into structured JSON.

## Data flow — scrape

```
 POST /api/v1/influencers/:id/refresh
       │
       │  (authenticate + RBAC + expensiveOperationLimiter)
       ▼
 InfluencerService.refresh(id)
       │
       │  check cache in `scrape_jobs` by (platform, handle, endpoint, day)
       ▼
 ScrapeCreatorsClient.fetchProfile(platform, handle)
       │  retry + backoff + timeout
       ▼
 mapProfile(raw)  →  InfluencerProfile
       │
       ▼
 Repository writes:
   • influencer_metrics_snapshots (append-only)
   • scrape_jobs (cache entry)
   • audit_logs (hash-chained)
```

## Persistence model

Per-table RLS enforces tenant isolation. The service-role key, used by the server, bypasses RLS and is responsible for enforcing authorization at the application layer before writes.

Append-only tables — `audit_logs`, `influencer_metrics_snapshots` — have `before update`/`before delete` triggers that reject mutation at the database layer.

## Jobs

A lightweight `node-cron` scheduler runs in-process for MVP. For horizontal scaling the scheduler should be upgraded to BullMQ + Redis; job implementations do not depend on the transport.

- `metrics-refresh` (nightly) — iterate active influencer accounts and enqueue scrape jobs.
- `kyc-expiry-sweep` (nightly) — flag KYC records past `expires_at`.
- `audit-chain-verify` (nightly) — re-hash the previous day's audit rows and alert on break.

## Observability

- Logs: JSON (`pino`), streamed to Railway logs. Sensitive fields redacted by path.
- Metrics: per-request latency + status exposed via structured logs; upgrade to OpenTelemetry when scaling.
- Errors: optional Sentry via `SENTRY_DSN`.

## Deploy topology

- Three Railway environments (`dev`, `staging`, `prod`) each paired with a Supabase project.
- CI (`ci.yml`) runs on every PR: lint, format, typecheck, tests, build.
- CodeQL runs weekly + on PR.
- Database migrations live in `supabase/migrations/` and are applied via `supabase db push` (manually gated per env for ICO audit traceability).
