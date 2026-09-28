-- ============================================================================
-- Migration: 0007_saas_role_sync.sql
-- FleetFlow SaaS — keeps the two role systems consistent.
--
-- THE TWO MODELS:
--   profiles.role             — app-wide capability (which screens open:
--                               Settings, Reports, Console…)
--   organization_members.role — per-org authority (what data RLS exposes)
--
-- BUG: handle_new_saas_user granted the first user of a client org
-- 'Super Admin' membership, but 0001's handle_new_user stamped their
-- profiles.role as 'Staff' (it only promotes the platform's very first
-- user). Result: a client org owner could see all their org's DATA but got
-- a Staff UI — no Settings, no Reports, gated Console.
--
-- FIX: upgrade-only sync. When a membership role ranks higher on the app
-- ladder than the profile role, the profile follows (never downgrades —
-- app-wide capability stays even if an org lists someone lower).
-- Backfills every existing account the same way.
--
-- Requires: 0003 (organization_members). Re-runnable.
-- ============================================================================

create or replace function public.sync_profile_role()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  best text;
begin
  -- Highest-ranked ACTIVE membership role across the user's orgs.
  select m.role into best
    from public.organization_members m
   where m.user_id = new.user_id
     and m.status = 'Active'
   order by case m.role
     when 'Super Admin' then 4
     when 'Admin'       then 3
     when 'Supervisor'  then 2
     when 'Driver'      then 1
     else 0
   end desc
   limit 1;

  if best is null then
    return null;  -- membership removed; profile role untouched (admin may re-assign)
  end if;

  -- Upgrade only: never demote an app-wide role because of one org.
  update public.profiles p
     set role = best
   where p.id = new.user_id::text
     and case p.role
       when 'Super Admin' then 4
       when 'Admin'       then 3
       when 'Supervisor'  then 2
       when 'Driver'      then 1
       else 0
     end < case best
       when 'Super Admin' then 4
       when 'Admin'       then 3
       when 'Supervisor'  then 2
       when 'Driver'      then 1
       else 0
     end;
  return null;  -- AFTER trigger; row change done via the update above
end;
$$;

drop trigger if exists trg_sync_profile_role on public.organization_members;
create trigger trg_sync_profile_role
  after insert or update of role, status
  on public.organization_members
  for each row execute function public.sync_profile_role();

-- One-time backfill for every account that predates this trigger
-- (same upgrade-only rule, applied to the whole table).
update public.profiles p
   set role = ranked.best
  from (
    select m.user_id,
           (array_agg(m.role order by
              case m.role
                when 'Super Admin' then 4
                when 'Admin'       then 3
                when 'Supervisor'  then 2
                when 'Driver'      then 1
                else 0
              end desc))[1] as best
      from public.organization_members m
     where m.status = 'Active'
     group by m.user_id
  ) ranked
 where p.id = ranked.user_id::text
   and case p.role
     when 'Super Admin' then 4
     when 'Admin'       then 3
     when 'Supervisor'  then 2
     when 'Driver'      then 1
     else 0
   end < case ranked.best
     when 'Super Admin' then 4
     when 'Admin'       then 3
     when 'Supervisor'  then 2
     when 'Driver'      then 1
     else 0
   end;

-- ---------------------------------------------------------------------------
-- VERIFY
--   -- the probe account (membership Super Admin, profile Staff) must now read:
--   select email, role from public.profiles
--    where email = 'fleetflow.smokeprobe.0928@gmail.com';   -- ⇒ Super Admin
--
--   -- first signup of a NEW client org:
--   -- profiles.role ⇒ 'Super Admin' automatically (trigger fires on insert)
-- ============================================================================
