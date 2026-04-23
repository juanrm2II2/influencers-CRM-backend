# Security & audit controls

This document captures the threat model and the controls implemented (or stubbed for implementation in subsequent phases) to make the service pre-ICO audit ready.

## Threat model (summary)

| Actor                   | Abuse                                                  | Control                                                                    |
| ----------------------- | ------------------------------------------------------ | -------------------------------------------------------------------------- |
| External unauthenticated | Brute-force auth, DoS, webhook replay                  | Rate limiting, JWT verification, HMAC-signed webhooks with timestamp skew  |
| External authenticated  | Privilege escalation, cross-tenant access              | RBAC middleware + Supabase RLS; org membership checks                      |
| Insider (employee)      | Tampering with historical records                      | Append-only `audit_logs`/metrics; hash-chained audit log; DB triggers      |
| Database compromise     | Reading PII, forging audit entries                     | App-layer AES-256-GCM for KYC PII; HMAC secret held outside DB             |
| Supply chain            | Malicious dependency                                   | `npm audit`, GitHub Dependabot, CodeQL, minimal dependency surface         |
| Secret leakage          | Tokens/keys in logs                                    | `pino` redact paths; secrets only via env; `.env` gitignored               |

## Controls

### Authentication

- Supabase Auth issues JWTs (HS256). The backend verifies every token with `SUPABASE_JWT_SECRET` using a constant-time HMAC compare. `alg: none` and asymmetric algs are rejected.
- Server-to-server API keys are stored as SHA-256 hashes (`api_keys.key_hash`). Plaintext is shown to the creator exactly once.
- Signup is invite-only (`POST /users/invite`, admin role required); there is no public registration endpoint.

### Authorization

- RBAC roles: `admin`, `manager`, `analyst`, `auditor`, enforced by `requireRole()` middleware.
- Every Supabase table has RLS enabled with deny-by-default. Helper functions `has_role_in_org()` and `is_org_member()` back the policies.
- The service-role key is only used on the server and is responsible for enforcing authorization before issuing writes.

### Data protection

- KYC PII is encrypted application-side (AES-256-GCM, random IV, authenticated) before the ciphertext is written to `kyc_records.pii_encrypted`. The encryption key is held in env (`KYC_ENCRYPTION_KEY`). The ciphertext is versioned (`v1`) so keys can be rotated via envelope encryption without schema changes.
- Contracts store only a SHA-256 of the document; the document itself lives in Supabase Storage under the owning org's namespace.
- Payments accept `method: 'crypto'` with `chain`, `token`, and `wallet_address` so an on-chain payment flow can be wired in later without schema migration.

### Auditability

- Every mutation writes a row to `audit_logs` containing: actor, org, action, entity type/id, before/after diff, IP, user-agent.
- Rows are hash-chained:  
  `row_hash = HMAC_SHA256(AUDIT_HMAC_SECRET, prev_hash || canonicalJSON(payload))`.
- DB triggers make `audit_logs` and `influencer_metrics_snapshots` append-only (update/delete raise).
- The scheduled `audit-chain-verify` job re-verifies the previous day's chain and alerts on a break. Auditors can call `GET /api/v1/audit/verify` on demand.
- Canonical JSON (sorted keys) ensures that semantically-identical payloads produce identical hashes regardless of serialization order, so a verifier can re-compute hashes from the DB.

### Transport / edge

- TLS is terminated by Railway. `trust proxy` is set so `req.ip` reflects `X-Forwarded-For`.
- `helmet` sets HSTS, `X-Content-Type-Options: nosniff`, frame guard, referrer policy. CSP is opt-in (`production` only).
- CORS allowlist is driven by the `CORS_ORIGINS` env var. Credentials are allowed only for listed origins.
- Global rate limit (`express-rate-limit`); tighter per-user limits for cost-bearing endpoints such as `/influencers/:id/refresh`.

### Input handling

- Every request body, query, and path-param is validated with a zod schema. Unknown fields are rejected by default where strict.
- Webhook handlers read the raw body (via `express.raw`) and verify an HMAC signature with a timestamp check (≤ 300s skew) to prevent replay.

### Secrets

- All secrets enter via environment variables. `.env` is gitignored; `.env.example` documents every key.
- Pino logger redacts `authorization`, `cookie`, `x-api-key`, `password`, `token`, `refreshToken`, `apiKey`, `secret`, and any `pii.*` or `*.kyc`.
- JWT secret and audit HMAC secret are distinct and rotatable.

### Supply chain

- Dependencies are pinned to current stable majors and checked against the GitHub Advisory DB before being added.
- CodeQL runs on PR and weekly on `main`.
- Dockerfile is multi-stage, final image runs as the unprivileged `node` user.

## Out-of-scope / to be implemented

Items explicitly tracked for later phases (non-exhaustive):

- Swap in-memory rate limit store for Redis for multi-instance deployments.
- Key rotation procedure for `AUDIT_HMAC_SECRET` and `KYC_ENCRYPTION_KEY` with a documented rollover SQL migration.
- Integration with an actual KYC vendor (adapter per provider, selected by the `provider` field).
- Wallet-auth (SIWE) for ICO token holders if chosen as an auth channel.
- SBOM generation and signed release artifacts for the Docker image.
- Alignment with a formal framework (SOC 2 CC-series, ISO 27001 Annex A, MiCA for crypto payment flows).
