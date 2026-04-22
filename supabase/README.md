# Supabase migrations

SQL migrations applied in filename order. Apply via the Supabase CLI:

```bash
supabase db push
```

or execute each file against the database using `psql` or the Supabase SQL editor.

Migrations:

- `0001_init.sql` — extensions, organizations, users, roles, RBAC, API keys, audit log (hash-chained, append-only), ScrapeCreators cache.
- `0002_domain.sql` — influencers, influencer accounts, metrics snapshots (append-only), campaigns, contracts, payments (fiat + crypto), KYC records.
- `0003_rls.sql` — Row-Level Security policies. All tables have RLS enabled with deny-by-default.

**Important:** The service-role key bypasses RLS. Server-side code that uses the service client (see `src/config/supabase.ts`) is responsible for enforcing authorization before writes.
