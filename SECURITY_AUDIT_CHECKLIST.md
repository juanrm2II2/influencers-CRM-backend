# Pre‑ICO Security Audit — Findings Checklist

This checklist is the **canonical machine‑readable record** of audit
findings for `influencers-CRM-backend`.  CI parses it with
`scripts/compute-readiness.js` and computes the readiness score using
the formula:

```
score = 100 − 12·(open H) − 4·(open M) − 1·(open L)
```

Marking an item as **resolved** moves the line from `OPEN` to
`RESOLVED`.  Only `OPEN` findings count against the score.

> **Scope note.**  This repository is a **backend REST API** with no
> frontend, no smart contracts, and no on‑chain Web3 / wallet
> integration.  Audit objectives related to client‑side rendering
> (XSS via `dangerouslySetInnerHTML`, markdown rendering, CSP for HTML
> pages) and to blockchain logic (signature requests, chain‑ID
> validation, replay attacks, transaction building, RPC URL leakage)
> are documented as **Not Applicable** below rather than ignored.

Audit date: **2026‑04‑25**
Auditor:    **Pre‑ICO Independent Audit (automated + manual)**
Commit:     auto‑detected by the readiness workflow

---

## High severity (H)

_No high‑severity findings open at the time of audit.  The previous
H1 (RLS bypass — service‑role client used for every user‑facing query)
and H2 (no tenant/owner column on core data tables) findings have been
remediated by migration `008_add_user_id_and_enable_rls.sql` and the
per‑request `req.scopedClient` flow added in
`src/middleware/auth.ts:99` + `src/services/supabase.ts:41`._

---

## Medium severity (M)

- [ ] **OPEN — M1**  `eraseUserData` does not erase user‑owned
  `influencers` and `outreach` rows.
  `src/services/privacy.ts:222‑275` deletes `consent`, anonymises
  `audit_log`, and closes `dsar_requests` but leaves the user's CRM
  data in place.  GDPR Art. 17 right‑to‑erasure is therefore
  **incomplete**.  Fix: cascade delete (or pseudonymise) rows from
  `influencers`, `outreach`, and any future user‑scoped tables; rely
  on the existing `ON DELETE CASCADE` (`migrations/008…sql:23`) only
  if the auth.users row itself is deleted.
- [ ] **OPEN — M2**  `errorHandler` does not check `res.headersSent`
  before writing the 500 body.  `src/middleware/errorHandler.ts:11‑20`
  will throw `ERR_HTTP_HEADERS_SENT` when an error fires after the
  controller has begun streaming a response (e.g. inside the
  `auditLog` `res.json` wrapper at
  `src/middleware/auditLog.ts:91‑113`), masking the original error
  and producing noisy crash loops.  Fix: short‑circuit with
  `if (res.headersSent) return _next(err);`.
- [ ] **OPEN — M3**  Audit‑log `after_state` persists the entire
  sanitised request body, which includes free‑text fields
  (`notes`, `message_sent`, `response`) that may contain personal
  data.  `src/middleware/auditLog.ts:99‑107` writes
  `after_state: req.body`.  The current
  `eraseUserData` flow (`src/services/privacy.ts:241‑254`) only
  anonymises `actor_id` / `actor_email` / `ip_address`, leaving the
  PII inside the JSONB `after_state` column intact.  Fix: redact or
  drop the `after_state` column for rows belonging to an erased
  user, or stop persisting free‑text body content (store a diff hash
  or column allow‑list instead).
- [ ] **OPEN — M4**  Middleware ordering on
  `PATCH /api/privacy/requests/:id` runs body validators **before**
  the `authorize('admin')` gate.  `src/routes/privacy.ts:55‑61`
  registers `validateIdParam, validateDsarUpdate, authorize('admin')`
  in that order, so a non‑admin caller learns whether their payload
  is well‑formed (400 vs. 403) before being told they lack
  permission.  Low‑information oracle, but trivial to fix.  Reorder
  to `validateIdParam, authorize('admin'), validateDsarUpdate`.

---

## Low severity (L)

- [ ] **OPEN — L1**  `/health/ready` is unauthenticated yet performs
  a Supabase round‑trip and a key‑provider check on every call.
  `src/app.ts:145‑178` is open to anonymous traffic and could be
  used for cheap DB/quota amplification.  Fix: shed traffic using a
  small rate limiter (`max: 30, windowMs: 60_000`) or restrict the
  endpoint to internal IPs only.
- [ ] **OPEN — L2**  `process.env.PORT ?? 3001` is consumed without
  validation.  `src/index.ts:41` accepts any string; setting
  `PORT=foo` produces an opaque `listen` failure.  Fix: parse with
  `Number()` and fall back when `!Number.isFinite()`.
- [ ] **OPEN — L3**  `POST /api/auth/logout` is only protected by
  the global IP rate limiter (100 req / 15 min).
  `src/routes/auth.ts:8` does not apply a per‑user limit, so an
  attacker with a stolen token could repeatedly invalidate sessions
  across users by replaying `Authorization` headers.  Fix: apply a
  user‑keyed rate limiter (≤ 10 req / 15 min / `sub`).
- [ ] **OPEN — L4**  `requireConsent` returns the same 403 message
  whether the caller has never granted consent or has revoked it.
  `src/middleware/requireConsent.ts:41‑43` is intentional, but a
  separate machine‑readable error code (`CONSENT_REVOKED` vs
  `CONSENT_MISSING`) would let UIs guide users without leaking
  data.  Fix: add an `error_code` field.
- [ ] **OPEN — L5**  `.env.example:21‑25` documents
  `BULK_SEARCH_CONCURRENCY` defaulting to 3 but the runtime cap is
  10 (`src/controllers/influencers.controller.ts:351‑354`).
  Operators reading the env file may believe they cannot exceed 3.
  Fix: document the upper bound in `.env.example`.
- [ ] **OPEN — L6**  `extractProfileData` silently substitutes the
  scraped handle for `full_name` when upstream omits it.
  `src/services/scrapeCreators.ts:150‑155` then writes that handle
  through PII encryption.  Benign, but storing the handle as PII
  conflates two fields.  Fix: leave `full_name = null` when no
  display name is present.
- [ ] **OPEN — L7**  500 responses do not echo the request‑ID set by
  `src/middleware/requestId.ts`.  `src/middleware/errorHandler.ts:19`
  returns `{ error: 'Internal server error' }` only.  Operationally
  inconvenient when debugging in production logs.  Fix: include
  `requestId: req.id` in the body.
- [ ] **OPEN — L8**  Admin `PATCH /api/privacy/requests/:id` writes
  via the service‑role client, bypassing RLS.
  `src/services/privacy.ts:138‑168` does not constrain by
  `user_id`, so an admin can edit any DSAR.  This is intentional
  (support staff resolving DSARs) but is not separately
  audit‑trailed beyond the generic `auditLog` middleware.  Fix:
  add a dedicated `admin_action` log entry recording the admin
  identity and the affected DSAR row.

---

## Not Applicable (N/A) — categories with no surface in this repo

| Category | Reason |
|---|---|
| XSS via `dangerouslySetInnerHTML` / unsafe markdown | No frontend / no rendered HTML in this repo |
| Wallet connection / Web3 provider handling | No on‑chain code or `eth_*` calls |
| Signature requests / transaction building | N/A — no client signing flow |
| Chain‑ID validation / replay‑attack exposure | N/A |
| Insecure caching of sensitive data in Redux/Zustand/Context | N/A — backend, no client‑side store |
| RPC URL leakage | No RPC endpoints configured |
| `dotenv` `.env` shipped to the browser | N/A — server only |

The above categories are explicitly listed so a future commit that
introduces frontend or on‑chain code knows where to add coverage.

---

## Counts (consumed by `scripts/compute-readiness.js`)

<!-- AUDIT-COUNTS-START -->
- Open High:    0
- Open Medium:  4
- Open Low:     8
- Resolved:     2 (legacy H1, H2)
<!-- AUDIT-COUNTS-END -->

Computed score (formula `100 − 12·H − 4·M − 1·L`):

```
100 − (12 × 0) − (4 × 4) − (1 × 8) = 76
```

## Verdict

**Not yet ready** for Pre‑ICO / investor‑facing release.  Score
**76 / 100** with **no High** findings open but **four Medium**
items (M1–M4) that touch GDPR completeness, error‑handler
robustness, audit‑log PII residue, and a privilege‑oracle in the
DSAR admin path.  Resolving all four Mediums and any three of the
Lows lifts the score above the **≥ 90** threshold the workflow
enforces.

## Prioritised remediation plan

1. **M1** — extend `eraseUserData` to delete `influencers` /
   `outreach` and any future user‑owned tables.  Add a regression
   test in `tests/integration/privacy.test.ts`.
2. **M3** — stop persisting raw `req.body` as `after_state`; switch
   to a column allow‑list or a redacted JSONB diff.  Backfill
   existing rows during the next maintenance window.
3. **M2** — add `if (res.headersSent) return _next(err);` to the
   error handler.  Add a unit test that asserts no double‑send.
4. **M4** — reorder middleware on the DSAR admin route so
   `authorize('admin')` runs before validators.
5. **L1, L3** — add per‑route rate limiters (`/health/ready`,
   `/api/auth/logout`).
6. **L7** — include `requestId` in 500 responses.
7. **L2, L5, L6, L4, L8** — documentation, validation, and
   admin‑audit polish.

After these changes the readiness score becomes **100** and the
verdict moves to **Ready** for the independent Pre‑ICO audit.
