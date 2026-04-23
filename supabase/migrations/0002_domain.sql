-- 0002_domain.sql
-- Domain tables: influencers, influencer accounts, metrics snapshots,
-- campaigns, contracts, payments, KYC records.

-- ─── Influencers ─────────────────────────────────────────────────────────
create table if not exists public.influencers (
  id            uuid primary key default gen_random_uuid(),
  org_id        uuid not null references public.organizations(id) on delete cascade,
  display_name  text check (display_name is null or char_length(display_name) between 1 and 200),
  canonical_handle text not null check (char_length(canonical_handle) between 1 and 100),
  primary_platform text not null
                     check (primary_platform in ('tiktok','instagram','youtube','twitter')),
  category      text,
  country       char(2),
  language      text,
  verified      boolean not null default false,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  unique (org_id, primary_platform, canonical_handle)
);
create trigger trg_influencers_updated_at
  before update on public.influencers
  for each row execute function public.set_updated_at();
create index if not exists idx_influencers_org on public.influencers(org_id);
alter table public.influencers enable row level security;

-- ─── Influencer accounts (one influencer : many social accounts) ────────
create table if not exists public.influencer_accounts (
  id            uuid primary key default gen_random_uuid(),
  influencer_id uuid not null references public.influencers(id) on delete cascade,
  platform      text not null
                  check (platform in ('tiktok','instagram','youtube','twitter')),
  handle        text not null check (char_length(handle) between 1 and 100),
  profile_url   text,
  is_active     boolean not null default true,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  unique (platform, handle)
);
create trigger trg_influencer_accounts_updated_at
  before update on public.influencer_accounts
  for each row execute function public.set_updated_at();
create index if not exists idx_influencer_accounts_inf on public.influencer_accounts(influencer_id);
alter table public.influencer_accounts enable row level security;

-- ─── Time-series metrics (append-only) ──────────────────────────────────
create table if not exists public.influencer_metrics_snapshots (
  id               uuid primary key default gen_random_uuid(),
  account_id       uuid not null references public.influencer_accounts(id) on delete cascade,
  captured_at      timestamptz not null default now(),
  followers        integer not null check (followers >= 0),
  following        integer check (following is null or following >= 0),
  posts            integer check (posts is null or posts >= 0),
  engagement_rate  numeric(6,5) check (engagement_rate is null or (engagement_rate >= 0 and engagement_rate <= 1)),
  avg_views        integer check (avg_views is null or avg_views >= 0),
  audience         jsonb,
  source_job_id    uuid references public.scrape_jobs(id) on delete set null
);
create index if not exists idx_metrics_account_captured
  on public.influencer_metrics_snapshots(account_id, captured_at desc);

-- Metrics are append-only.
create or replace function public.metrics_immutable()
returns trigger language plpgsql as $$
begin
  raise exception 'influencer_metrics_snapshots is append-only';
end;
$$;
drop trigger if exists trg_metrics_no_update on public.influencer_metrics_snapshots;
create trigger trg_metrics_no_update
  before update on public.influencer_metrics_snapshots
  for each row execute function public.metrics_immutable();
drop trigger if exists trg_metrics_no_delete on public.influencer_metrics_snapshots;
create trigger trg_metrics_no_delete
  before delete on public.influencer_metrics_snapshots
  for each row execute function public.metrics_immutable();

alter table public.influencer_metrics_snapshots enable row level security;

-- ─── Campaigns ──────────────────────────────────────────────────────────
create table if not exists public.campaigns (
  id            uuid primary key default gen_random_uuid(),
  org_id        uuid not null references public.organizations(id) on delete cascade,
  name          text not null check (char_length(name) between 1 and 200),
  brand         text not null check (char_length(brand) between 1 and 200),
  budget_cents  bigint not null check (budget_cents >= 0),
  currency      char(3) not null,
  goals         text,
  status        text not null default 'draft'
                  check (status in ('draft','active','paused','completed','cancelled')),
  starts_at     timestamptz,
  ends_at       timestamptz,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  constraint campaigns_date_order
    check (starts_at is null or ends_at is null or ends_at >= starts_at)
);
create trigger trg_campaigns_updated_at
  before update on public.campaigns
  for each row execute function public.set_updated_at();
create index if not exists idx_campaigns_org_status on public.campaigns(org_id, status);
alter table public.campaigns enable row level security;

create table if not exists public.campaign_influencers (
  campaign_id    uuid not null references public.campaigns(id) on delete cascade,
  influencer_id  uuid not null references public.influencers(id) on delete cascade,
  deliverables   text,
  price_cents    bigint not null check (price_cents >= 0),
  currency       char(3) not null,
  status         text not null default 'invited'
                   check (status in ('invited','accepted','declined','delivered','paid','cancelled')),
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  primary key (campaign_id, influencer_id)
);
create trigger trg_campaign_influencers_updated_at
  before update on public.campaign_influencers
  for each row execute function public.set_updated_at();
alter table public.campaign_influencers enable row level security;

-- ─── Contracts ──────────────────────────────────────────────────────────
create table if not exists public.contracts (
  id              uuid primary key default gen_random_uuid(),
  campaign_id     uuid not null references public.campaigns(id) on delete cascade,
  influencer_id   uuid not null references public.influencers(id) on delete cascade,
  storage_path    text not null,
  document_sha256 char(64) not null check (document_sha256 ~ '^[0-9a-f]{64}$'),
  effective_at    timestamptz not null,
  expires_at      timestamptz,
  status          text not null default 'draft'
                    check (status in ('draft','pending_signature','signed','expired','void')),
  signed_at       timestamptz,
  signer_name     text,
  signer_email    citext,
  signature_method text check (signature_method in ('click','eid','wallet')),
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);
create trigger trg_contracts_updated_at
  before update on public.contracts
  for each row execute function public.set_updated_at();
create index if not exists idx_contracts_campaign on public.contracts(campaign_id);
alter table public.contracts enable row level security;

-- ─── Payments (fiat + crypto) ───────────────────────────────────────────
create table if not exists public.payments (
  id            uuid primary key default gen_random_uuid(),
  campaign_id   uuid not null references public.campaigns(id) on delete restrict,
  influencer_id uuid not null references public.influencers(id) on delete restrict,
  method        text not null check (method in ('bank_transfer','stripe','crypto')),
  amount_cents  bigint not null check (amount_cents > 0),
  currency      char(3) not null,
  status        text not null default 'pending'
                  check (status in ('pending','processing','settled','failed','refunded')),
  reference     text,
  -- Crypto-specific fields (null for fiat).
  chain         text check (chain is null or chain in ('evm','solana')),
  token         text,
  wallet_address text,
  tx_hash       text,
  initiated_at  timestamptz not null default now(),
  settled_at    timestamptz,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  constraint payments_crypto_fields
    check (
      (method = 'crypto' and chain is not null and token is not null and wallet_address is not null)
      or (method <> 'crypto' and chain is null and token is null and wallet_address is null and tx_hash is null)
    )
);
create trigger trg_payments_updated_at
  before update on public.payments
  for each row execute function public.set_updated_at();
create index if not exists idx_payments_campaign on public.payments(campaign_id);
create index if not exists idx_payments_status on public.payments(status);
alter table public.payments enable row level security;

-- ─── KYC records (PII encrypted at app layer) ───────────────────────────
create table if not exists public.kyc_records (
  id              uuid primary key default gen_random_uuid(),
  org_id          uuid not null references public.organizations(id) on delete cascade,
  subject_type    text not null check (subject_type in ('influencer','counterparty')),
  subject_id      uuid not null,
  provider        text not null,
  provider_ref    text,
  status          text not null default 'pending'
                    check (status in ('pending','in_review','approved','rejected','expired')),
  risk_level      text check (risk_level in ('low','medium','high')),
  -- PII blob is AES-256-GCM encrypted application-side before insert.
  pii_encrypted   text,
  expires_at      timestamptz,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  unique (org_id, subject_type, subject_id, provider)
);
create trigger trg_kyc_updated_at
  before update on public.kyc_records
  for each row execute function public.set_updated_at();
create index if not exists idx_kyc_subject on public.kyc_records(subject_type, subject_id);
alter table public.kyc_records enable row level security;
