-- 0013 — Platform Super Admin full-access coverage
-- ---------------------------------------------------------------------------
-- The platform owner (Super Admin membership + is_org_owner = true, e.g.
-- rjsvillahermosa@gmail.com) must be able to VIEW, EDIT and DELETE across
-- every tenant for compliance and support. 0003 scoped the ops tables with
-- assert_org_access() alone, which meant:
--   * other orgs' data was invisible to the owner (only own-org data showed)
--   * legacy NULL-org rows (pre-tenancy bookings) were invisible to everyone
--     through the API — the recovery scenario
-- Ordinary Admin/Staff/Driver/Supervisor stay strictly org-scoped: this adds
-- an OR-branch for is_platform_super() only, which requires is_org_owner.
--
-- Idempotent: policies are dropped by their 0003 names and recreated.

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
          public.assert_org_access(organization_id) or public.is_platform_super()
        )
        with check (
          public.assert_org_access(organization_id) or public.is_platform_super()
        )
    $ddl$, t || '_org_scoped', t);
  end loop;
end $$;

-- organizations: owner manages every org (rename, plan, paywall caps)
drop policy if exists "orgs admins update" on public.organizations;
create policy "orgs admins update" on public.organizations
  for update using (
    public.get_my_org_role(id) in ('Super Admin','Admin') or public.is_platform_super()
  )
  with check (
    public.get_my_org_role(id) in ('Super Admin','Admin') or public.is_platform_super()
  );

-- members: owner can view/manage every org's team (Clients page member panels)
drop policy if exists "members read own orgs" on public.organization_members;
create policy "members read own orgs" on public.organization_members
  for select using (
    organization_id in (select public.get_my_org_ids()) or public.is_platform_super()
  );
drop policy if exists "members admins manage" on public.organization_members;
create policy "members admins manage" on public.organization_members
  for all using (
    public.get_my_org_role(organization_id) in ('Super Admin','Admin')
    or public.is_platform_super()
  )
  with check (
    public.get_my_org_role(organization_id) in ('Super Admin','Admin')
    or public.is_platform_super()
  );

-- ---------------------------------------------------------------------------
-- VERIFY (SQL editor):
--   select count(*) from pg_policies
--   where tablename in ('vehicles','transport_requests','drivers','fuel_logs',
--                       'mileage_logs','incidents','service_logs')
--     and qual like '%is_platform_super()%';   -- expect 7
--   -- Then in the app as rjsvillahermosa@gmail.com:
--   --   Missions/Fleet/etc. show your org's data as before, AND any legacy
--   --   NULL-org rows become visible to you (and only you).
--   -- Probe user (Super Admin, NOT owner) gains nothing new: is_org_owner
--   -- is required, so the privacy wall between client orgs still holds.
-- ---------------------------------------------------------------------------
