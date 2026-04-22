-- 0003_rls.sql
-- Row-Level Security policies. Principles:
--   • Every table has RLS enabled (done in 0001/0002).
--   • Default deny: no policy => no access for non-service-role users.
--   • The service-role key bypasses RLS, so privileged server code is
--     expected to enforce authorization before writing.
--   • User-context queries go through policies that look up membership
--     in org_members and user_roles.

-- Helper: does the current JWT user have a role in a given org?
create or replace function public.has_role_in_org(_org uuid, _roles text[])
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.user_roles ur
    where ur.user_id = auth.uid()
      and ur.org_id  = _org
      and ur.role = any(_roles)
  );
$$;

create or replace function public.is_org_member(_org uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.org_members om
    where om.user_id = auth.uid() and om.org_id = _org
  );
$$;

-- ─── organizations ──────────────────────────────────────────────────────
drop policy if exists organizations_select on public.organizations;
create policy organizations_select on public.organizations
  for select using (public.is_org_member(id));

-- ─── users ──────────────────────────────────────────────────────────────
drop policy if exists users_select_self on public.users;
create policy users_select_self on public.users
  for select using (id = auth.uid());

-- ─── roles (read-only reference table) ─────────────────────────────────
drop policy if exists roles_select_all on public.roles;
create policy roles_select_all on public.roles
  for select using (auth.role() = 'authenticated');

-- ─── org_members ────────────────────────────────────────────────────────
drop policy if exists org_members_select on public.org_members;
create policy org_members_select on public.org_members
  for select using (public.is_org_member(org_id));

-- ─── user_roles ────────────────────────────────────────────────────────
drop policy if exists user_roles_select on public.user_roles;
create policy user_roles_select on public.user_roles
  for select using (user_id = auth.uid() or public.has_role_in_org(org_id, array['admin']));

-- ─── api_keys (admin only) ─────────────────────────────────────────────
drop policy if exists api_keys_select on public.api_keys;
create policy api_keys_select on public.api_keys
  for select using (public.has_role_in_org(org_id, array['admin']));

-- ─── audit_logs (auditors and admins) ──────────────────────────────────
drop policy if exists audit_logs_select on public.audit_logs;
create policy audit_logs_select on public.audit_logs
  for select using (
    org_id is not null and public.has_role_in_org(org_id, array['admin','auditor'])
  );

-- ─── scrape_jobs ───────────────────────────────────────────────────────
drop policy if exists scrape_jobs_select on public.scrape_jobs;
create policy scrape_jobs_select on public.scrape_jobs
  for select using (auth.role() = 'authenticated');

-- ─── influencers ───────────────────────────────────────────────────────
drop policy if exists influencers_select on public.influencers;
create policy influencers_select on public.influencers
  for select using (public.is_org_member(org_id));

drop policy if exists influencers_modify on public.influencers;
create policy influencers_modify on public.influencers
  for all
  using (public.has_role_in_org(org_id, array['admin','manager']))
  with check (public.has_role_in_org(org_id, array['admin','manager']));

-- ─── influencer_accounts ──────────────────────────────────────────────
drop policy if exists influencer_accounts_select on public.influencer_accounts;
create policy influencer_accounts_select on public.influencer_accounts
  for select using (
    exists (
      select 1 from public.influencers i
      where i.id = influencer_id and public.is_org_member(i.org_id)
    )
  );

-- ─── influencer_metrics_snapshots (read for org members) ─────────────
drop policy if exists metrics_select on public.influencer_metrics_snapshots;
create policy metrics_select on public.influencer_metrics_snapshots
  for select using (
    exists (
      select 1
      from public.influencer_accounts a
      join public.influencers i on i.id = a.influencer_id
      where a.id = account_id and public.is_org_member(i.org_id)
    )
  );

-- ─── campaigns ─────────────────────────────────────────────────────────
drop policy if exists campaigns_select on public.campaigns;
create policy campaigns_select on public.campaigns
  for select using (public.is_org_member(org_id));

drop policy if exists campaigns_modify on public.campaigns;
create policy campaigns_modify on public.campaigns
  for all
  using (public.has_role_in_org(org_id, array['admin','manager']))
  with check (public.has_role_in_org(org_id, array['admin','manager']));

-- ─── campaign_influencers ──────────────────────────────────────────────
drop policy if exists campaign_influencers_select on public.campaign_influencers;
create policy campaign_influencers_select on public.campaign_influencers
  for select using (
    exists (
      select 1 from public.campaigns c
      where c.id = campaign_id and public.is_org_member(c.org_id)
    )
  );

-- ─── contracts ─────────────────────────────────────────────────────────
drop policy if exists contracts_select on public.contracts;
create policy contracts_select on public.contracts
  for select using (
    exists (
      select 1 from public.campaigns c
      where c.id = campaign_id and public.is_org_member(c.org_id)
    )
  );

-- ─── payments ──────────────────────────────────────────────────────────
drop policy if exists payments_select on public.payments;
create policy payments_select on public.payments
  for select using (
    exists (
      select 1 from public.campaigns c
      where c.id = campaign_id
        and public.has_role_in_org(c.org_id, array['admin','manager','auditor'])
    )
  );

-- ─── kyc_records (admin, manager, auditor only) ────────────────────────
drop policy if exists kyc_records_select on public.kyc_records;
create policy kyc_records_select on public.kyc_records
  for select using (public.has_role_in_org(org_id, array['admin','manager','auditor']));
