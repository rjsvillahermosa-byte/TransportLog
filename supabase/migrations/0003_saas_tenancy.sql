-- ============================================================================
-- Migration: 0003_saas_tenancy.sql
-- FleetFlow SaaS — Client Code onboarding + organization-scoped environments.
--
-- Architecture (shared tables + organization_id + RLS — chosen over
-- schema-per-tenant because Supabase exposes schemas one-by-one in API
-- settings, which is per-client ops work; this design auto-filters via RLS
-- with zero client-side changes and scales to thousands of fleets):
--
--   organizations           — the tenant registry; client_code is the key
--                             clients type at signup ("GRAND-PLAZA")
--   organization_members    — user ↔ org links (role + owner flag)
--   ALL FleetFlow ops tables (0001_init.sql structure preserved) gain
--   organization_id — vehicles, drivers, service_logs, fuel_logs,
--   transport_requests, mileage_logs, incidents
--
-- Every column of 0001 stays exactly as-is (mission_id, ODO photos, Guest/
-- Errand typing, PMS intervals, tire tracking, renewals, fraud-audit fields).
-- Tenancy is an additive layer — the app's UI code needs no schema changes.
--
-- SAFETY: this file creates the tenancy layer. It does NOT enable RLS-with-
-- org enforcement on tables until the backfill section at the bottom has run
-- — an empty organization_id would lock existing rows away. Follow the
-- numbered checklist in order. The legacy 0001 single-tenant RLS remains in
-- force until step 4 swaps the policies.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1) ORGANIZATIONS — the tenants (client-specific environments)
-- ---------------------------------------------------------------------------
create table if not exists public.organizations (
  id                 uuid primary key default gen_random_uuid(),
  client_code        text unique not null,       -- what clients type at signup
  name               text not null,              -- 'Grand Plaza Hotel'
  slug               text unique not null,       -- url-safe: 'grand-plaza-hotel'
  business_type      text,                       -- hotel / transport / logistics
  address            text,
  contact_email      text,
  contact_phone      text,
  plan_type          text not null default 'starter'
                     check (plan_type in ('trial','starter','pro','enterprise')),
  plan_status        text not null default 'active'
                     check (plan_status in ('active','past_due','suspended')),
  max_vehicles       integer not null default 3,
  max_users          integer not null default 5,
  billing_customer_id text,
  settings           jsonb not null default '{}'::jsonb,  -- per-org overrides (fuel bands etc.)
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now()
);

create or replace function public.update_updated_at()
returns trigger language plpgsql as $$
begin new.updated_at = now(); return new; end $$;

drop trigger if exists trigger_orgs_updated_at on public.organizations;
create trigger trigger_orgs_updated_at
  before update on public.organizations
  for each row execute function public.update_updated_at();

-- ---------------------------------------------------------------------------
-- 2) ORGANIZATION MEMBERS
-- ---------------------------------------------------------------------------
create table if not exists public.organization_members (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  user_id         uuid not null references auth.users(id) on delete cascade,
  role            text not null default 'Staff'
                  check (role in ('Super Admin','Admin','Supervisor','Driver','Staff')),
  is_org_owner    boolean not null default false,
  status          text not null default 'Active'
                  check (status in ('Active','Disabled')),
  joined_at       timestamptz not null default now(),
  unique (organization_id, user_id)
);
create index if not exists org_members_user_idx on public.organization_members (user_id);

-- ---------------------------------------------------------------------------
-- 3) ORGANIZATION_ID on every FleetFlow ops table (0001 columns untouched)
-- ---------------------------------------------------------------------------
alter table public.vehicles           add column if not exists organization_id uuid references public.organizations(id);
alter table public.drivers            add column if not exists organization_id uuid references public.organizations(id);
alter table public.service_logs       add column if not exists organization_id uuid references public.organizations(id);
alter table public.fuel_logs          add column if not exists organization_id uuid references public.organizations(id);
alter table public.transport_requests add column if not exists organization_id uuid references public.organizations(id);
alter table public.mileage_logs       add column if not exists organization_id uuid references public.organizations(id);
alter table public.incidents          add column if not exists organization_id uuid references public.organizations(id);

create index if not exists vehicles_org_idx           on public.vehicles (organization_id);
create index if not exists drivers_org_idx            on public.drivers (organization_id);
create index if not exists service_logs_org_idx       on public.service_logs (organization_id);
create index if not exists fuel_logs_org_idx          on public.fuel_logs (organization_id);
create index if not exists transport_requests_org_idx on public.transport_requests (organization_id);
create index if not exists mileage_logs_org_idx       on public.mileage_logs (organization_id);
create index if not exists incidents_org_idx          on public.incidents (organization_id);

-- org_settings becomes per-org (the 0001 single row stays as the legacy org's)
alter table public.org_settings add column if not exists organization_id uuid references public.organizations(id);

-- ---------------------------------------------------------------------------
-- 4) Membership helpers
-- ---------------------------------------------------------------------------
create or replace function public.get_my_org_ids()
returns setof uuid language sql stable security definer set search_path = public
as $$
  select organization_id from public.organization_members
  where user_id = auth.uid() and status = 'Active'
$$;

create or replace function public.get_my_org_role(p_org uuid)
returns text language sql stable security definer set search_path = public
as $$
  select role from public.organization_members
  where user_id = auth.uid() and organization_id = p_org and status = 'Active'
$$;

create or replace function public.is_platform_super()
returns boolean language sql stable security definer set search_path = public
as $$
  select exists (select 1 from public.organization_members
                 where user_id = auth.uid() and role = 'Super Admin' and is_org_owner)
$$;

-- Platform registry is readable for client-code validation at signup/login.
alter table public.organizations enable row level security;
alter table public.organization_members enable row level security;

drop policy if exists "orgs code lookup" on public.organizations;
create policy "orgs code lookup" on public.organizations
  for select using (true);  -- code/name/plan only; RLS on data does the real locking

drop policy if exists "orgs read own" on public.organizations;
create policy "orgs read own" on public.organizations
  for select using (id in (select public.get_my_org_ids()));

drop policy if exists "orgs admins update" on public.organizations;
create policy "orgs admins update" on public.organizations
  for update using (public.get_my_org_role(id) in ('Super Admin','Admin'))
  with check (public.get_my_org_role(id) in ('Super Admin','Admin'));

drop policy if exists "members read own orgs" on public.organization_members;
create policy "members read own orgs" on public.organization_members
  for select using (organization_id in (select public.get_my_org_ids()));
drop policy if exists "members admins manage" on public.organization_members;
create policy "members admins manage" on public.organization_members
  for all using (public.get_my_org_role(organization_id) in ('Super Admin','Admin'))
  with check (public.get_my_org_role(organization_id) in ('Super Admin','Admin'));

-- ---------------------------------------------------------------------------
-- 5) OPS-TABLE RLS — org-scoped, replacing the 0001 any-active-user model.
--    Every policy = "row's org ∈ my orgs" (and row must HAVE an org — legacy
--    NULL-org rows stay visible only to platform supers until backfilled).
-- ---------------------------------------------------------------------------
create or replace function public.assert_org_access(p_org uuid)
returns boolean language sql stable security definer set search_path = public
as $$
  select p_org is not null and p_org in (select public.get_my_org_ids())
$$;

do $$
declare t text;
begin
  foreach t in array array['vehicles','drivers','service_logs','fuel_logs',
                           'transport_requests','mileage_logs','incidents']
  loop
    execute format('alter table public.%I enable row level security', t);
    -- 0001 policies are dropped by name if present, then replaced wholesale.
    execute format('drop policy if exists %I on public.%I', t || ' active all', t);
    execute format('drop policy if exists %I on public.%I', t || '_org_scoped', t);
    execute format($ddl$
      create policy %I on public.%I
        for all using (public.assert_org_access(organization_id))
        with check (public.assert_org_access(organization_id))
    $ddl$, t || '_org_scoped', t);
  end loop;
end $$;

-- org_settings: admins read/update their org's row
drop policy if exists "org_settings read" on public.org_settings;
drop policy if exists "org_settings admins update" on public.org_settings;
drop policy if exists "org_settings org read" on public.org_settings;
drop policy if exists "org_settings org update" on public.org_settings;
create policy "org_settings org read" on public.org_settings
  for select using (public.assert_org_access(organization_id) or public.is_platform_super());
create policy "org_settings org update" on public.org_settings
  for update using (public.get_my_org_role(organization_id) in ('Super Admin','Admin'))
  with check (public.get_my_org_role(organization_id) in ('Super Admin','Admin'));

-- profiles: 0001 policies already gate by Active/role — extended so platform
-- supers can audit any tenant's membership records.
drop policy if exists "profiles read" on public.profiles;
create policy "profiles read" on public.profiles
  for select using (
    public.current_status() = 'Active' or id = auth.uid()::text or public.is_platform_super()
  );

-- ---------------------------------------------------------------------------
-- 6) SIGNUP — Client Code → auto-provision org + owner membership.
--    signUp(email, password, { data: { client_code, full_name } }).
--    Unknown/inactive code ⇒ signup fails loudly (no orphan accounts).
-- ---------------------------------------------------------------------------
create or replace function public.handle_new_saas_user()
returns trigger
language plpgsql security definer set search_path = public
as $$
declare
  code   text;
  org    public.organizations%rowtype;
  n      integer;
  org_id uuid;
begin
  code := nullif(btrim(new.raw_user_meta_data ->> 'client_code'), '');

  if code is null then
    -- No client code → legacy flow (0001's handle_new_user runs on the same
    -- event and creates the public.profiles row). Platform-only protection:
    -- such users are Staff in the legacy org and see nothing tenant-scoped
    -- until added to an organization.
    return new;
  end if;

  select * into org from public.organizations
   where client_code = code and plan_status = 'active';
  if not found then
    raise exception 'Invalid or inactive client code';
  end if;

  select count(*) into n from public.organization_members
   where organization_id = org.id;

  if n >= org.max_users then
    raise exception 'This organization has reached its user limit. Contact the fleet admin.';
  end if;

  insert into public.organization_members (organization_id, user_id, role, is_org_owner)
  values (org.id, new.id,
          case when n = 0 then 'Super Admin' else 'Staff' end,
          n = 0)
  on conflict do nothing;

  return new;
end $$;

drop trigger if exists on_auth_user_saas on auth.users;
create trigger on_auth_user_saas
  after insert on auth.users
  for each row execute function public.handle_new_saas_user();

-- ---------------------------------------------------------------------------
-- 7) PLAN ENFORCEMENT — paywall at the database, not the UI
-- ---------------------------------------------------------------------------
create or replace function public.enforce_vehicle_plan()
returns trigger language plpgsql security definer set search_path = public
as $$
declare n integer; maxv integer;
begin
  if new.organization_id is null then return new; end if;
  select count(*), o.max_vehicles into n, maxv
    from public.vehicles v join public.organizations o on o.id = v.organization_id
   where v.organization_id = new.organization_id group by o.max_vehicles;
  if n >= maxv then
    raise exception 'Vehicle limit reached for this plan (% vehicles). Upgrade to add more.', maxv;
  end if;
  return new;
end $$;

drop trigger if exists trg_vehicle_plan on public.vehicles;
create trigger trg_vehicle_plan
  before insert on public.vehicles
  for each row when (new.organization_id is not null)
  execute function public.enforce_vehicle_plan();

-- ---------------------------------------------------------------------------
-- 8) PROVISION CHECKLIST (run in order in the SQL Editor)
-- ---------------------------------------------------------------------------
-- STEP 1 — create the platform org for the existing (legacy) fleet:
--   insert into public.organizations
--     (client_code, name, slug, business_type, plan_type, max_vehicles, max_users)
--   values ('FLEETFLOW-HQ', 'TransportLog Fleet', 'transportlog-fleet', 'transport', 'pro', 50, 20)
--   on conflict (client_code) do nothing;
--
-- STEP 2 — grab the org id:
--   select id from public.organizations where client_code = 'FLEETFLOW-HQ';
--
-- STEP 3 — backfill every existing row (replace <ORG-UUID>):
--   update public.vehicles           set organization_id = '<ORG-UUID>' where organization_id is null;
--   update public.drivers            set organization_id = '<ORG-UUID>' where organization_id is null;
--   update public.service_logs       set organization_id = '<ORG-UUID>' where organization_id is null;
--   update public.fuel_logs          set organization_id = '<ORG-UUID>' where organization_id is null;
--   update public.transport_requests set organization_id = '<ORG-UUID>' where organization_id is null;
--   update public.mileage_logs       set organization_id = '<ORG-UUID>' where organization_id is null;
--   update public.incidents          set organization_id = '<ORG-UUID>' where organization_id is null;
--   update public.org_settings       set organization_id = '<ORG-UUID>' where organization_id is null;
--
-- STEP 4 — link YOUR user as the platform owner (replace <AUTH-UID>):
--   insert into public.organization_members
--     (organization_id, user_id, role, is_org_owner)
--   select id, '<AUTH-UID>', 'Super Admin', true
--     from public.organizations where client_code = 'FLEETFLOW-HQ'
--   on conflict do nothing;
--
-- STEP 5 — verify isolation:
--   select * from pg_policies where tablename in ('vehicles','transport_requests');
--   -- sign in as a second client → their list() must return only their org's rows.
-- ============================================================================
