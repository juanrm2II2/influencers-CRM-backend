# influencers-CRM-backend

Influencers Dashboard — CRM Backend.

A TypeScript / Node.js (Express 5) REST API for searching, enriching, and
managing influencer profiles, with first-class GDPR support (consent,
DSAR, data export, right to erasure, retention purge), strong
authentication (Supabase JWT with pluggable key providers), row-level
security, column-level PII encryption, audit logging, and rate limiting.

---

## Tech stack

- **Runtime:** Node.js `>=20`
- **Language:** TypeScript (compiled with `tsc`)
- **Web framework:** Express 5
- **Database / Auth:** Supabase (PostgreSQL + GoTrue), with Row Level Security
- **External data source:** [ScrapeCreators](https://scrapecreators.com) API (Zod-validated responses)
- **Security:** `helmet`, `cors`, `express-rate-limit`, `sanitize-html`, `jsonwebtoken`
- **Observability:** `pino` structured logging with request-ID correlation
- **Optional:** `@aws-sdk/client-kms`, `@aws-sdk/client-secrets-manager`, `jwks-rsa`
- **Testing:** Jest + Supertest (`ts-jest`)
- **Container:** Multi-stage Dockerfile, runs as non-root, base image pinned by SHA-256 digest

---

## Repository layout

```
.
├── Dockerfile              # Multi-stage build, digest-pinned node:20-alpine
├── migrations/             # SQL migrations (revoked tokens, influencers,
│                           #  outreach, audit log, consent, DSAR, RLS, …)
├── docs/                   # Privacy Policy, Terms, Data Processing Agreement
├── src/
│   ├── index.ts            # Process bootstrap (env validation, key provider
│   │                       #  init, graceful shutdown)
│   ├── app.ts              # Express app factory (middleware + route wiring)
│   ├── validateEnv.ts      # Required env-var checks per key provider
│   ├── logger.ts           # pino logger
│   ├── routes/             # /api/auth, /api/influencers, /api/privacy
│   ├── controllers/        # Route handlers
│   ├── middleware/         # auth, authorize, requireConsent, requireHttps,
│   │                       # requestId, contentType, sanitize, auditLog,
│   │                       # validate, errorHandler
│   ├── services/           # supabase client, scrapeCreators, keyProvider,
│   │                       # tokenBlocklist, fieldEncryption, piiFields,
│   │                       # privacy (export/erase/purge), auditLog
│   └── types/
└── tests/                  # Jest test suites
```

---

## Getting started

### Prerequisites

- Node.js `>=20` and npm
- A Supabase project (URL, `anon` key, `service_role` key, JWT secret)
- A ScrapeCreators API key
- (Optional) AWS account if you use KMS / Secrets Manager / column-level PII encryption

### Install

```bash
npm install
```

### Configure environment

Copy the example file and fill in values:

```bash
cp .env.example .env
```

Required for every deployment:

| Variable | Purpose |
| --- | --- |
| `SUPABASE_URL` | Supabase project URL |
| `SUPABASE_SERVICE_KEY` | Service-role key (admin operations: audit, blocklist, erasure, purge) |
| `SUPABASE_ANON_KEY` | Anon/public key — used to build per-request RLS-scoped clients |
| `SCRAPECREATORS_API_KEY` | API key for ScrapeCreators |
| `KEY_PROVIDER` | JWT key source: `env` \| `aws-kms` \| `aws-secrets-manager` \| `rs256-pem` \| `jwks` (default: `env`) |

Provider-specific variables (see `.env.example` for the full list):

- `env` → `SUPABASE_JWT_SECRET` (HS256, **dev only** — refused in production
  unless `ALLOW_INSECURE_KEY_PROVIDER=true`)
- `aws-kms` → `KMS_KEY_ID`, `KMS_ENCRYPTED_SECRET`, `AWS_REGION`
- `aws-secrets-manager` → `AWS_SECRET_ARN`, optional `AWS_SECRET_KEY`, `AWS_REGION`
- `rs256-pem` → `JWT_PUBLIC_KEY_PEM` (RS256)
- `jwks` → `JWT_JWKS_URI` (RS256, recommended for production)

Optional:

- `PORT` (default `3001`)
- `LOG_LEVEL` (default `info`)
- `CORS_ALLOWED_ORIGINS` — comma-separated allow-list (default `http://localhost:3000`)
- `TRUST_PROXY` — number of proxy hops, CIDR list, or `false` (default `1`)
- `BULK_SEARCH_RATE_LIMIT` (default `5`/15 min/user)
- `BULK_SEARCH_CONCURRENCY` (default `3`)
- `SCRAPER_CACHE_TTL_MS` (default `600000`)
- `FIELD_ENCRYPTION_KMS_KEY_ID` — enable AES-256-GCM column-level PII encryption via AWS KMS

### Database migrations

Apply the SQL files in `migrations/` (in order) to your Supabase
PostgreSQL instance. They create the `revoked_tokens`, `influencers`,
`outreach`, `audit_log`, `consent`, and `dsar_requests` tables, mark
encrypted PII columns, add `user_id` ownership columns, and enable Row
Level Security.

### Run

```bash
# Development (auto-reload)
npm run dev

# Production
npm run build
npm start
```

The server listens on `PORT` (default `3001`).

### Docker

```bash
docker build -t influencers-crm-backend .
docker run --rm -p 3001:3001 --env-file .env influencers-crm-backend
```

The image runs as a non-root user and exposes port `3001`.

---

## Scripts

| Script | Description |
| --- | --- |
| `npm run build` | Compile TypeScript to `dist/` |
| `npm start` | Run the compiled server (`node dist/index.js`) |
| `npm run dev` | Start with `nodemon` + `ts-node` |
| `npm test` | Run the Jest suite (`--forceExit --detectOpenHandles`) |
| `npm run test:coverage` | Run tests with coverage |

---

## API

All `/api/*` routes require a Supabase-issued JWT in the
`Authorization: Bearer <token>` header. Tokens must include a `jti` claim
(used for revocation via the in-memory blocklist).

### Health

| Method | Path | Description |
| --- | --- | --- |
| `GET` | `/health` | Liveness probe (always `200 ok`) |
| `GET` | `/health/ready` | Readiness probe — verifies JWT key provider and DB connectivity (returns `503` when unhealthy) |

### Auth — `/api/auth`

| Method | Path | Description |
| --- | --- | --- |
| `POST` | `/logout` | Revoke the current JWT (adds `jti` to the blocklist) and call `supabase.auth.admin.signOut(user, 'global')` to invalidate refresh tokens |

### Influencers — `/api/influencers`

Authentication, data-processing consent (`requireConsent`), body
sanitization, and audit logging are applied to every route in this group.

| Method | Path | Description |
| --- | --- | --- |
| `POST` | `/search` | Look up a single handle via ScrapeCreators and upsert |
| `POST` | `/bulk-search` | Batched lookup with per-user rate limit (default 5/15 min) and bounded concurrency |
| `GET` | `/` | List influencers (paginated; RLS-scoped to caller) |
| `GET` | `/:id` | Fetch one influencer |
| `PATCH` | `/:id` | Update an influencer |
| `DELETE` | `/:id` | Delete an influencer (**admin role required**) |
| `POST` | `/:id/outreach` | Record an outreach attempt |

### Privacy / GDPR — `/api/privacy`

| Method | Path | Description |
| --- | --- | --- |
| `GET` | `/consent` | List the caller's consent records |
| `POST` | `/consent` | Grant or revoke a consent purpose |
| `GET` | `/requests` | List the caller's DSAR requests |
| `POST` | `/requests` | Open a new DSAR request |
| `PATCH` | `/requests/:id` | Update DSAR status (**admin only**) |
| `GET` | `/export` | Export all of the caller's data (data portability) |
| `DELETE` | `/data` | Erase all of the caller's personal data (right to erasure) |
| `POST` | `/purge` | Trigger the data-retention purge job (**admin only**) |

---

## Security model

The application implements multiple layers of defense:

- **HTTPS enforcement** in production (`requireHttps` middleware).
- **Helmet** with a locked-down CSP (`default-src 'none'`,
  `frame-ancestors 'none'`), 2-year HSTS with `includeSubDomains`/`preload`,
  `Referrer-Policy: no-referrer`, and tight `Cross-Origin-*-Policy` headers.
- **Strict JSON Content-Type** enforcement (`enforceJsonContentType` +
  `express.json({ type: 'application/json', limit: '1mb' })`) so
  `text/plain` cannot bypass downstream sanitisation.
- **CORS** with an explicit allow-list and structured rejection logging.
- **Global rate limit** (100 req / 15 min / IP) plus a stricter per-user
  limit on `/bulk-search`.
- **JWT verification** via a pluggable `keyProvider` that pins algorithms
  (`HS256` for symmetric providers, `RS256` for `rs256-pem` / `jwks`).
  The symmetric `env` provider is refused in production unless explicitly
  overridden.
- **Token revocation** via an in-memory `jti` blocklist plus
  `supabase.auth.admin.signOut(user, 'global')` for refresh tokens.
- **Authorization** via the `authorize('admin')` middleware for
  destructive / privileged endpoints.
- **Row Level Security**: every user-facing query runs through a
  per-request scoped Supabase client built from the anon key + the
  caller's JWT (`createScopedClient()`). The service-role client is
  reserved for admin tasks (audit, blocklist, erasure, purge).
- **Column-level PII encryption** (optional): when
  `FIELD_ENCRYPTION_KMS_KEY_ID` is set, fields listed in
  `src/services/piiFields.ts` (`full_name`, `bio`, `profile_pic_url`,
  `profile_url`) are encrypted at rest with AES-256-GCM and AWS KMS
  envelope encryption.
- **Input validation** with Zod (request bodies, query strings, params,
  and ScrapeCreators API responses).
- **HTML sanitization** of request bodies via `sanitize-html`.
- **Audit log** for state-changing operations.
- **Request-ID correlation** propagated through structured `pino` logs.
- **Hardened container**: multi-stage Dockerfile, non-root user,
  digest-pinned base image, `npm ci --omit=dev --ignore-scripts`.

See [`SECURITY.md`](./SECURITY.md) for the responsible-disclosure policy
and the audit reports / white paper at the repository root.

---

## Testing

```bash
npm test
```

Jest is configured (`jest.config.js`) with `ts-jest` and runs the suites
in `tests/`. Tests use `supertest` against the Express app produced by
`createApp()` so they run without binding to a real port.

---

## Documentation

Legal / compliance documents live in [`docs/`](./docs):

- [`PRIVACY_POLICY.md`](./docs/PRIVACY_POLICY.md)
- [`TERMS_OF_SERVICE.md`](./docs/TERMS_OF_SERVICE.md)
- [`DATA_PROCESSING_AGREEMENT.md`](./docs/DATA_PROCESSING_AGREEMENT.md)

Security audit artifacts are checked in at the repo root
(`AUDIT_REPORT.pdf`, `WHITE_PAPER.pdf`,
[`SECURITY_AUDIT_CHECKLIST.md`](./SECURITY_AUDIT_CHECKLIST.md)).
The Pre-ICO readiness score (`100 − 12·H − 4·M − 1·L`) is recomputed in
CI on every push by [`.github/workflows/readiness.yml`](./.github/workflows/readiness.yml)
via [`scripts/compute-readiness.js`](./scripts/compute-readiness.js).
The PDFs themselves are regenerated from the checklist with
[`scripts/generate_pdfs.py`](./scripts/generate_pdfs.py)
(`pip install reportlab && python3 scripts/generate_pdfs.py`).

---

## License

ISC — see `package.json`.
