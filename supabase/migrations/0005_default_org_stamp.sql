-- ============================================================================
-- Migration: 0005_default_org_stamp.sql
-- FleetFlow SaaS — stamps new rows with the caller's organization.
--
-- WHY: 0003's org-scoped RLS rejects any row whose organization_id is null
-- (assert_org_access(null) = false). The backfill covered rows that existed
-- before tenancy, but neither the web app's entity creates nor the native
-- app's inserts set organization_id — so the FIRST create after 0003 went
-- live would fail with "new row violates row-level security policy".
--
-- FIX: BEFORE INSERT trigger stamps organization_id from the caller's first
-- active membership (order by joined_at → deterministic for multi-org
-- supers). No membership ⇒ stays null ⇒ insert is rejected, which is the
-- intended 0003 behavior for users outside any organization.
--
-- Trigger name sorts before trg_vehicle_plan so vehicles are stamped before
-- the plan-count paywall trigger counts them.
-- Requirements: 0003 (organization_members), optionally 0002 (locations —
-- guarded with to_regclass so 0005 also works on a fresh 0001+0003+0004 DB).
-- Re-runnable: create or replace + drop policy-style guards.
-- ============================================================================

create or replace function public.set_default_org()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  my_org uuid;
begin
  if new.organization_id is null then
    select m.organization_id into my_org
      from public.organization_members m
     where m.user_id = auth.uid()
       and m.status = 'Active'
     order by m.joined_at
     limit 1;
    -- No active membership ⇒ my_org (and the row) stays null and the
    -- org-scoped WITH CHECK policy rejects the insert — by design.
    new.organization_id := my_org;
  end if;
  return new;
end;
$$;

do $triggers$
declare
  t text;
begin
  foreach t in array array[
    'vehicles','drivers','service_logs','fuel_logs',
    'transport_requests','mileage_logs','incidents','saved_reports'
  ]
  loop
    execute format('drop trigger if exists trg_default_org_%I on public.%I', t, t);
    execute format($ddl$
      create trigger trg_default_org_%I
        before insert on public.%I
        for each row execute function public.set_default_org()
    $ddl$, t, t);
  end loop;

  -- locations lives in the native repo's 0002 and may not exist yet on a
  -- fresh stack; only attach when the table is present.
  if to_regclass('public.locations') is not null then
    execute 'drop trigger if exists trg_default_org_locations on public.locations';
    execute $ddl$
      create trigger trg_default_org_locations
        before insert on public.locations
        for each row execute function public.set_default_org()
    $ddl$;
  end if;
end
$triggers$;

-- ---------------------------------------------------------------------------
-- VERIFY
--   select tgname from pg_trigger
--    where tgrelid = 'public.vehicles'::regclass and not tgisinternal;
--   -- expect trg_default_org_vehicles (and trg_vehicle_plan)
--
--   Live check (as a signed-in org member):
--     insert into public.vehicles (plate_number) values ('TEST 0005');
--     select plate_number, organization_id from public.vehicles
--      where plate_number = 'TEST 0005';   -- organization_id must be set
--     delete from public.vehicles where plate_number = 'TEST 0005';
-- ============================================================================
