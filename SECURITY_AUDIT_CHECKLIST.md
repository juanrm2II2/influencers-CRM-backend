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

- [x] **RESOLVED — M1**  `eraseUserData` now deletes user‑owned
  `outreach` and `influencers` rows in addition to anonymising
  `audit_log` and closing `dsar_requests`, fully satisfying
  GDPR Art. 17.  See `src/services/privacy.ts` (`eraseUserData`)
  and the `should erase influencers and outreach rows (audit M1)`
  regression test in `tests/integration/privacy.test.ts`.
- [x] **RESOLVED — M2**  `errorHandler` now short‑circuits with
  `next(err)` when `res.headersSent` is true, so an error raised
  after the controller began streaming a response no longer throws
  `ERR_HTTP_HEADERS_SENT`.  See `src/middleware/errorHandler.ts`
  and the new `should short‑circuit via next(err) when headers have
  already been sent` test in `tests/unit/middleware/errorHandler.test.ts`.
- [x] **RESOLVED — M3**  The audit‑log middleware no longer persists
  the entire request body as `after_state`.  A non‑PII allow‑list
  (`status`, `niche`, `channel`, `handle`, `platform`,
  `consent_type`, `granted`, `request_type`, `contact_date`,
  `follow_up_date`) is applied in
  `src/middleware/auditLog.ts:redactAfterState`, and
  `eraseUserData` additionally clears the `before_state` /
  `after_state` JSONB columns for the erased user so historic rows
  contain no PII residue.
- [x] **RESOLVED — M4**  `PATCH /api/privacy/requests/:id` now
  registers `validateIdParam, authorize('admin'), validateDsarUpdate`
  in that order, so a non‑admin caller receives 403 before the
  payload validators reveal whether their body is well‑formed
  (`src/routes/privacy.ts`).

---

## Low severity (L)

- [x] **RESOLVED — L1**  `/health/ready` is now wrapped in a dedicated
  per‑IP rate limiter (30 req / minute) before the key‑provider
  check and Supabase round‑trip run, neutralising the cheap
  amplification surface (`src/app.ts:readyLimiter`).
- [x] **RESOLVED — L2**  `process.env.PORT` is parsed via the new
  `resolvePort()` helper that requires a finite integer in the
  1–65535 range and falls back to 3001 with a structured warning
  on invalid input (`src/index.ts`).
- [x] **RESOLVED — L3**  `POST /api/auth/logout` is now gated by a
  user‑keyed rate limiter (10 req / 15 min / `sub`, falling back
  to `req.ip`) layered on top of the global IP limiter
  (`src/routes/auth.ts:logoutLimiter`).
- [x] **RESOLVED — L4**  `requireConsent` now returns a
  machine‑readable `error_code` distinguishing `CONSENT_MISSING`
  from `CONSENT_REVOKED`, letting UIs prompt the right
  call‑to‑action without leaking sensitive state
  (`src/middleware/requireConsent.ts`).
- [x] **RESOLVED — L5**  `.env.example` now documents the runtime
  upper bound (10) for `BULK_SEARCH_CONCURRENCY` so operators do
  not believe the documented default of 3 is the cap.
- [x] **RESOLVED — L6**  `extractProfileData` no longer falls back
  to the scraped handle when the upstream payload omits a display
  name; `full_name` is left `null` in that case so the public
  handle is not routed through PII encryption
  (`src/services/scrapeCreators.ts`).
- [x] **RESOLVED — L7**  500 responses now echo the request
  correlation ID (`requestId`) set by `middleware/requestId.ts`,
  giving operators a deterministic key to match a customer report
  against the structured pino logs (`src/middleware/errorHandler.ts`).
- [x] **RESOLVED — L8**  `updateDsarStatus` now reads the previous
  status before applying the admin update and emits a dedicated
  `admin_action:dsar.update_status` audit‑log entry capturing the
  admin identity, the affected DSAR id, and the state transition,
  in addition to the generic `auditLog` middleware entry
  (`src/services/privacy.ts:updateDsarStatus`,
  `src/controllers/privacy.controller.ts:updateDsar`).

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
- Open Medium:  0
- Open Low:     0
- Resolved:     14 (legacy H1, H2; M1–M4; L1–L8)
<!-- AUDIT-COUNTS-END -->

Computed score (formula `100 − 12·H − 4·M − 1·L`):

```
100 − (12 × 0) − (4 × 0) − (1 × 0) = 100
```

## Verdict

**Ready** for the independent Pre‑ICO audit.  Score **100 / 100**
with **no open findings** in any severity bucket.  All four
Mediums (M1–M4) and all eight Lows (L1–L8) flagged in the
2026‑04‑25 internal audit have been remediated and covered by
regression tests.  The only remaining pre‑TGE actions are
**organisational**, not code:

* engage an external third‑party auditor (Trail of Bits / Halborn /
  Kudelski Security) for a formal letter — this checklist is the
  internal pre‑flight gate, not a substitute;
* stand up a paid bug‑bounty programme (Immunefi or HackerOne) at
  least two weeks before the token‑generation event, as already
  promised by `SECURITY.md`;
* operationalise the data‑retention purge job (the code in
  `src/services/privacy.ts:purgeExpiredData` is wired but the
  cron / scheduled task lives in the deployment repository);
* publish the runtime KMS key‑rotation procedure end‑to‑end (today
  it is documented only in `.env.example` comments).

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
