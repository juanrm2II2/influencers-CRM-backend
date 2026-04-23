<<<<<<< HEAD
# Influencers CRM — Backend

Pre-ICO audit-ready backend for an Influencer CRM. Built with **Express.js + TypeScript**, backed by **Supabase (PostgreSQL + Auth + Storage)**, sourced by the **ScrapeCreators API**, and deployed to **Railway**.

The companion frontend (Next.js 14 on Vercel) lives in a separate repository.

## Tech stack

| Concern     | Choice                                                                 |
| ----------- | ---------------------------------------------------------------------- |
| Runtime     | Node.js 20 LTS                                                         |
| Language    | TypeScript (`strict`)                                                  |
| Framework   | Express.js 4                                                           |
| Database    | Supabase (PostgreSQL)                                                  |
| Auth        | Supabase Auth (JWT HS256) + hashed API keys for server-to-server calls |
| Data source | ScrapeCreators API (TikTok, Instagram, YouTube, Twitter)               |
| Deploy      | Railway (Docker)                                                       |
| CI          | GitHub Actions (lint / typecheck / test / build / CodeQL)              |

## Getting started

Requires Node.js 20.x and a Supabase project.

```bash
cp .env.example .env
# Fill in SUPABASE_URL, SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY,
# SUPABASE_JWT_SECRET, SCRAPECREATORS_API_KEY, AUDIT_HMAC_SECRET,
# KYC_ENCRYPTION_KEY (32-byte hex).

npm install
npm run dev          # hot-reload dev server on :8080
npm run test         # unit + integration tests
npm run lint         # eslint
npm run typecheck    # tsc --noEmit
npm run build        # emit dist/
npm start            # run the built server
```

Apply database migrations (see `supabase/README.md`):

```bash
supabase db push
```

## Project layout

```
src/
  app.ts               # Express application factory
  server.ts            # HTTP listener + signal handling
  config/              # env (zod), logger (pino), Supabase clients
  middleware/          # request-id, error handler, auth, RBAC, validation, rate-limit
  integrations/
    scrapecreators/    # typed client with retry, cache, DTO mappers
  modules/             # feature modules (routes/controller/service/schema)
    auth/ users/ influencers/ influencer-accounts/ campaigns/
    contracts/ payments/ kyc/ reports/ audit/ webhooks/ health/
  jobs/                # node-cron scheduler (metrics refresh, KYC sweep, audit verify)
  utils/               # errors, hashing, crypto, audit hash chain, pagination, jwt
tests/                 # integration tests (Supertest)
supabase/migrations/   # SQL migrations (init, domain, RLS)
docs/                  # architecture and security docs
```

## API

All endpoints (except health and webhooks) are versioned under `/api/v1/`:

| Path                  | Description                                                           |
| --------------------- | --------------------------------------------------------------------- |
| `/auth`               | Login, refresh, logout, password reset, current user                  |
| `/users`              | Invite, list, assign roles, deactivate                                |
| `/influencers`        | List/search, create, get, refresh-from-source, metrics history        |
| `/influencers/:id/accounts`, `/accounts/:id` | Link, unlink, sync social accounts                |
| `/campaigns`          | CRUD campaigns, attach influencers                                    |
| `/contracts`          | Create, retrieve, sign, verify hash                                   |
| `/payments`           | Create, list, reconcile (fiat + `crypto` stub with chain/token/wallet) |
| `/kyc`                | Initiate, retrieve (provider-agnostic)                                |
| `/reports`            | Campaigns, payments, audit-pack (CSV/PDF/JSON)                        |
| `/audit`              | List audit log, verify chain integrity (admin/auditor only)           |
| `/webhooks/...`       | ScrapeCreators and KYC provider callbacks (HMAC-verified)             |
| `/health/live`, `/health/ready` | Liveness and readiness probes                               |

All mutating routes are guarded by `authenticate()` + `requireRole()` and validated with zod schemas. Every request carries a stable `X-Request-Id`.

## Security

See [`docs/security.md`](docs/security.md) for the full threat model. Highlights:

- Supabase JWTs verified with HS256 against `SUPABASE_JWT_SECRET`; `alg: none` rejected.
- RBAC roles: `admin`, `manager`, `analyst`, `auditor`, enforced both in middleware and in Supabase RLS.
- RLS enabled on every table with deny-by-default; service-role key is never shipped to clients.
- KYC PII is AES-256-GCM encrypted at the application layer before it reaches the database.
- Audit log is append-only and hash-chained; tampering breaks the chain and is detected by the scheduled verifier.
- Webhooks are HMAC-verified with timestamp anti-replay.
- Secrets come from env and are redacted from structured logs (`pino` redact).
- `helmet`, strict CORS allowlist, rate limiting.

## Architecture

See [`docs/architecture.md`](docs/architecture.md).

## Delivery status

This commit delivers Phase 1 (bootstrap) plus the structural foundations of Phases 2–9: schema, migrations, RLS, middleware, integration client, module skeletons, jobs, CI. Controller bodies for the domain modules return `501 NOT_IMPLEMENTED` and land in subsequent phases.
=======
# influencers-CRM-backend
Influencers Dashboard (CRM Backend)
>>>>>>> 17ef3c073da08a2589cd477774c945045b4ff8fd
