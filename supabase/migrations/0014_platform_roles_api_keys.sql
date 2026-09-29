-- 0014 — Platform team roles + API integration groundwork
-- ---------------------------------------------------------------------------
-- PLATFORM SIDE (your team) vs CLIENT SIDE (tenant teams) as two axes:
--   profiles.role          — client-side role inside an org (unchanged)
--   profiles.platform_role — nullable platform-staff flag:
--       'Platform Admin'    — run the platform: full CRUD across tenants
--       'Platform Auditor'  — compliance: READ-ONLY across every tenant
--       'Platform Support'  — dev/support: view everything, fix rows,
--                             never delete tenant data
--   A platform_role alone does NOT require org membership. is_platform_super()
--   (Super Admin + is_org_owner) stays the ultimate authority; these roles are
--   its delegates.
--
-- API SIDE: api_keys table for server-to-server integration per org.
--   * key stored as SHA-256 hash — plaintext shown ONCE at creation
--   * per-org scope, active flag, last_used_at tracking
--   * RLS: only the org's admins (+ platform supers) may manage keys.
--     The hash IS readable to those admins — acceptable: it's a one-way
--     digest of a 256-bit random key, so it can't be replayed as the key.

-- 1) platform roles ---------------------------------------------------------
alter table public.profiles
  add column if not exists platform_role text
  check (platform_role in ('Platform Admin','Platform Auditor','Platform Support'));

-- helpers mirroring is_platform_super()'s style (SECURITY DEFINER, stable)
create or replace function public.platform_role_of(p_uid uuid)
returns text language sql stable security definer set search_path = public
as $$
  select platform_role from public.profiles where id = p_uid::text
$$;

create or replace function public.is_platform_admin()
returns boolean language sql stable security definer set search_path = public
as $$
  select coalesce((
    select platform_role in ('Platform Admin','Platform Auditor','Platform Support')
    from public.profiles where id = auth.uid()::text
  ), false) or public.is_platform_super()
$$;

create or replace function public.can_platform_write()
returns boolean language sql stable security definer set search_path = public
as $$
  select coalesce((
    select platform_role in ('Platform Admin','Platform Support')
    from public.profiles where id = auth.uid()::text
  ), false) or public.is_platform_super()
$$;

-- 2) platform access across every tenant ------------------------------------
-- Auditors read everything; Admin/Support/owner read+write; nobody here
-- deletes except Admin + owner (Support can fix rows, not remove them).

do $$
declare t text;
begin
  foreach t in array array['vehicles','drivers','service_logs','fuel_logs',
                           'transport_requests','mileage_logs','incidents']
  loop
    execute format('drop policy if exists %I on public.%I', t || '_org_scoped', t);
    execute format($ddl$
      create policy %I on public.%I
        for all using (
          public.assert_org_access(organization_id)
          or public.is_platform_super()
          or public.is_platform_admin()
        )
        with check (
          public.assert_org_access(organization_id)
          or public.can_platform_write()
        )
    $ddl$, t || '_org_scoped', t);
  end loop;
end $$;

-- platform team can read every org + membership (Clients page, audits)
drop policy if exists "orgs read own" on public.organizations;
create policy "orgs read own" on public.organizations
  for select using (
    id in (select public.get_my_org_ids()) or public.is_platform_admin()
  );
drop policy if exists "members read own orgs" on public.organization_members;
create policy "members read own orgs" on public.organization_members
  for select using (
    organization_id in (select public.get_my_org_ids()) or public.is_platform_admin()
  );

-- profiles: platform team audits any staff directory (read-only for auditors —
-- update/delete stay with admins + supers via existing 0001 policies)
drop policy if exists "profiles read" on public.profiles;
create policy "profiles read" on public.profiles
  for select using (
    public.current_status() = 'Active'
    or id = auth.uid()::text
    or public.is_platform_super()
    or public.is_platform_admin()
  );

-- 3) API keys (per-org server-to-server integration) -------------------------
create table if not exists public.api_keys (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  name            text not null default 'Integration',
  key_prefix      text not null,            -- first 12 chars, for identification
  key_hash        text not null,            -- sha-256 of the full key
  scopes          text not null default 'read',  -- 'read' | 'write'
  is_active       boolean not null default true,
  last_used_at    timestamptz,
  created_by      uuid,
  created_date    timestamptz not null default now()
);

create unique index if not exists api_keys_prefix_uidx
  on public.api_keys (key_prefix);

alter table public.api_keys enable row level security;

drop policy if exists "api_keys admins manage" on public.api_keys;
create policy "api_keys admins manage" on public.api_keys
  for all using (
    public.get_my_org_role(organization_id) in ('Super Admin','Admin')
    or public.is_platform_super()
  )
  with check (
    public.get_my_org_role(organization_id) in ('Super Admin','Admin')
    or public.is_platform_super()
  );

-- lookup helper for the future Edge Function auth: match a raw key
create or replace function public.api_key_lookup(p_raw_key text)
returns table (organization_id uuid, scopes text)
language sql stable security definer set search_path = public, extensions
as $$
  select organization_id, scopes
  from public.api_keys
  where is_active
    and key_hash = extensions.encode(extensions.digest(p_raw_key, 'sha256'), 'hex')
  limit 1
$$;

-- ---------------------------------------------------------------------------
-- VERIFY:
--   -- grant yourself Platform Admin (run in SQL editor as needed):
--   update public.profiles set platform_role = 'Platform Admin'
--    where email = 'rjsvillahermosa@gmail.com';
--   -- an auditor:
--   update public.profiles set platform_role = 'Platform Auditor'
--    where email = 'auditor@example.com';
--   -- create an API key (generate the raw value OUTSIDE the DB, e.g. in app):
--   insert into public.api_keys (organization_id, name, key_prefix, key_hash, scopes)
--   values ('fb4ee6e1-7ef8-40d9-8b03-590efcb28be7', 'PMS integration',
--           left('<raw key>', 12),
--           extensions.encode(extensions.digest('<raw key>', 'sha256'), 'hex'),
--           'read');
--   select * from public.api_key_lookup('<raw key>');  -- returns the org
-- ---------------------------------------------------------------------------
