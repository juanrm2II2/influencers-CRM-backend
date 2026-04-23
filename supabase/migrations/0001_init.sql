-- 0001_init.sql
-- Core schema: organizations, users, roles, audit log, scrape job cache.
-- All tables have RLS enabled with deny-by-default; explicit policies are
-- introduced in this and subsequent migrations.

-- ─── Extensions ────────────────────────────────────────────────────────────
create extension if not exists "pgcrypto";
create extension if not exists "uuid-ossp";
create extension if not exists "citext";

-- ─── Helper: updated_at trigger ───────────────────────────────────────────
create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- ─── Organizations (multi-tenant) ─────────────────────────────────────────
create table if not exists public.organizations (
  id           uuid primary key default gen_random_uuid(),
  name         text not null check (char_length(name) between 1 and 200),
  slug         text not null unique check (slug ~ '^[a-z0-9][a-z0-9-]{0,62}$'),
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);
create trigger trg_organizations_updated_at
  before update on public.organizations
  for each row execute function public.set_updated_at();
alter table public.organizations enable row level security;

-- ─── Application users (mirror of auth.users with app metadata) ──────────
create table if not exists public.users (
  id           uuid primary key references auth.users(id) on delete cascade,
  email        citext not null unique,
  display_name text,
  is_active    boolean not null default true,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);
create trigger trg_users_updated_at
  before update on public.users
  for each row execute function public.set_updated_at();
alter table public.users enable row level security;

-- ─── Roles ────────────────────────────────────────────────────────────────
create table if not exists public.roles (
  name         text primary key check (name in ('admin', 'manager', 'analyst', 'auditor')),
  description  text not null
);
insert into public.roles(name, description) values
  ('admin',   'Full access, including user and role management'),
  ('manager', 'Manage influencers, campaigns, contracts, payments'),
  ('analyst', 'Read influencer data and trigger refreshes'),
  ('auditor', 'Read-only access including audit log')
on conflict (name) do nothing;
alter table public.roles enable row level security;

-- ─── Org membership + roles ──────────────────────────────────────────────
create table if not exists public.org_members (
  org_id       uuid not null references public.organizations(id) on delete cascade,
  user_id      uuid not null references public.users(id) on delete cascade,
  created_at   timestamptz not null default now(),
  primary key (org_id, user_id)
);
alter table public.org_members enable row level security;

create table if not exists public.user_roles (
  user_id      uuid not null references public.users(id) on delete cascade,
  org_id       uuid not null references public.organizations(id) on delete cascade,
  role         text not null references public.roles(name) on delete restrict,
  granted_at   timestamptz not null default now(),
  granted_by   uuid references public.users(id) on delete set null,
  primary key (user_id, org_id, role)
);
alter table public.user_roles enable row level security;

-- ─── API keys (server-to-server) ─────────────────────────────────────────
create table if not exists public.api_keys (
  id            uuid primary key default gen_random_uuid(),
  org_id        uuid not null references public.organizations(id) on delete cascade,
  name          text not null,
  -- We store only a SHA-256 hash of the key; the plaintext is shown to the
  -- user exactly once at creation time.
  key_hash      text not null unique check (key_hash ~ '^[0-9a-f]{64}$'),
  -- Optional key prefix (e.g. "ick_live_") to help identify keys in logs
  -- without reconstructing the secret.
  key_prefix    text not null,
  scopes        text[] not null default '{}',
  last_used_at  timestamptz,
  expires_at    timestamptz,
  revoked_at    timestamptz,
  created_at    timestamptz not null default now(),
  created_by    uuid references public.users(id) on delete set null
);
create index if not exists idx_api_keys_org on public.api_keys(org_id);
alter table public.api_keys enable row level security;

-- ─── Audit log (append-only, hash-chained) ───────────────────────────────
create table if not exists public.audit_logs (
  seq          bigserial primary key,
  occurred_at  timestamptz not null default now(),
  actor_id     uuid references public.users(id) on delete set null,
  org_id       uuid references public.organizations(id) on delete set null,
  action       text not null check (char_length(action) between 1 and 128),
  entity_type  text not null check (char_length(entity_type) between 1 and 64),
  entity_id    uuid,
  context      jsonb not null default '{}'::jsonb,
  ip           inet,
  user_agent   text,
  prev_hash    text not null check (prev_hash ~ '^[0-9a-f]{64}$'),
  row_hash     text not null unique check (row_hash ~ '^[0-9a-f]{64}$')
);
create index if not exists idx_audit_logs_occurred_at on public.audit_logs(occurred_at desc);
create index if not exists idx_audit_logs_entity on public.audit_logs(entity_type, entity_id);
create index if not exists idx_audit_logs_org on public.audit_logs(org_id);

-- Prevent any update or delete on audit_logs at the SQL level. Even
-- service-role callers must go through cryptographic append.
create or replace function public.audit_logs_immutable()
returns trigger
language plpgsql
as $$
begin
  raise exception 'audit_logs is append-only (seq=%)', coalesce(old.seq, new.seq);
end;
$$;
drop trigger if exists trg_audit_logs_no_update on public.audit_logs;
create trigger trg_audit_logs_no_update
  before update on public.audit_logs
  for each row execute function public.audit_logs_immutable();
drop trigger if exists trg_audit_logs_no_delete on public.audit_logs;
create trigger trg_audit_logs_no_delete
  before delete on public.audit_logs
  for each row execute function public.audit_logs_immutable();

alter table public.audit_logs enable row level security;

-- ─── ScrapeCreators cache ────────────────────────────────────────────────
create table if not exists public.scrape_jobs (
  id            uuid primary key default gen_random_uuid(),
  platform      text not null check (platform in ('tiktok','instagram','youtube','twitter')),
  handle        text not null check (char_length(handle) between 1 and 100),
  endpoint      text not null,
  status        text not null default 'pending'
                  check (status in ('pending','running','succeeded','failed')),
  cache_key     text not null,
  payload       jsonb,
  cost_cents    integer,
  error         text,
  requested_by  uuid references public.users(id) on delete set null,
  requested_at  timestamptz not null default now(),
  completed_at  timestamptz,
  unique (cache_key)
);
create index if not exists idx_scrape_jobs_platform_handle on public.scrape_jobs(platform, handle);
create index if not exists idx_scrape_jobs_requested_at on public.scrape_jobs(requested_at desc);
alter table public.scrape_jobs enable row level security;
