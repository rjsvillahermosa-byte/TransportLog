-- 0016 — Close two cross-tenant access-control gaps found in security review
-- ---------------------------------------------------------------------------
-- BUG 1: is_platform_super() checked "is Super Admin + is_org_owner in ANY
-- org" with no organization scoping. handle_new_saas_user() (0003) grants
-- is_org_owner = true to the FIRST signup under ANY client code — meaning
-- every new tenant's founding user automatically became a full cross-tenant
-- super admin via the OR-branches added in 0011/0013/0014 (read+write on
-- vehicles, drivers, transport_requests, mileage_logs, fuel_logs,
-- service_logs, incidents, organizations, organization_members).
--
-- FIX: is_platform_super() now checks a real, single-purpose flag
-- (profiles.is_platform_owner) instead of the per-tenant is_org_owner flag.
-- Every policy across 0003/0011/0012/0013/0014 calls is_platform_super()
-- rather than repeating the logic, so replacing this one function closes the
-- hole everywhere it's used without touching any other policy.
--
-- BUG 2: "profiles admins update" / "profiles super admin delete" (0001)
-- check the caller's global profiles.role but never check which org the
-- target profile belongs to. When 0003 added tenancy it correctly dropped
-- and replaced the equivalent legacy policy on org_settings, but these two
-- on profiles were never touched — any org's Admin could update or delete
-- any OTHER tenant's user's profile row.
--
-- FIX: both now require the target profile to share an organization with
-- the caller (or the caller to be the real platform owner).
-- ---------------------------------------------------------------------------

-- 1) Real platform-owner flag, decoupled from per-tenant org ownership -------
alter table public.profiles add column if not exists is_platform_owner boolean not null default false;

-- One-time grant to the actual platform operator. Safe to re-run: it only
-- ever sets this for the one account, never clears anyone else's — if this
-- migration is re-applied, it won't undo a manually-granted flag elsewhere.
update public.profiles set is_platform_owner = true
 where email = 'rjsvillahermosa@gmail.com' and not is_platform_owner;

create or replace function public.is_platform_super()
returns boolean language sql stable security definer set search_path = public
as $$
  select coalesce((select is_platform_owner from public.profiles where id = auth.uid()::text), false)
$$;

-- 2) profiles admin/delete policies — require a shared organization --------
drop policy if exists "profiles admins update" on public.profiles;
create policy "profiles admins update" on public.profiles
  for update using (
    public.is_platform_super()
    or (
      public.current_role() in ('Super Admin', 'Admin')
      and exists (
        select 1 from public.organization_members me
        join public.organization_members target on target.organization_id = me.organization_id
        where me.user_id = auth.uid()
          and target.user_id = profiles.id::uuid
          and me.role in ('Super Admin', 'Admin')
      )
    )
  )
  with check (
    public.is_platform_super()
    or (
      public.current_role() in ('Super Admin', 'Admin')
      and exists (
        select 1 from public.organization_members me
        join public.organization_members target on target.organization_id = me.organization_id
        where me.user_id = auth.uid()
          and target.user_id = profiles.id::uuid
          and me.role in ('Super Admin', 'Admin')
      )
    )
  );

drop policy if exists "profiles super admin delete" on public.profiles;
create policy "profiles super admin delete" on public.profiles
  for delete using (
    public.is_platform_super()
    or (
      public.current_role() = 'Super Admin'
      and exists (
        select 1 from public.organization_members me
        join public.organization_members target on target.organization_id = me.organization_id
        where me.user_id = auth.uid()
          and target.user_id = profiles.id::uuid
          and me.role = 'Super Admin'
      )
    )
  );

-- ---------------------------------------------------------------------------
-- VERIFY:
--   -- exactly one row, you:
--   select email from public.profiles where is_platform_owner;
--
--   -- no leftover blanket status='Active' policies from before tenancy
--   -- (each table below should show exactly one row, the _org_scoped one):
--   select tablename, policyname from pg_policies
--   where tablename in ('vehicles','drivers','transport_requests',
--                        'mileage_logs','fuel_logs','service_logs','incidents')
--   order by tablename;
-- ============================================================================
