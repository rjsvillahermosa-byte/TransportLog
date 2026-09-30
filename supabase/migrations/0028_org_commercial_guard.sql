-- 0028 — Commercial columns are platform-owner-only
-- ---------------------------------------------------------------------------
-- The "orgs admins update" policy (0003/0013) lets an org's own Admin/
-- Super Admin update their organizations row — which until now included
-- plan_type, plan_status, max_vehicles, max_users and even client_code.
-- A client admin could therefore PATCH their own paywall caps via the API
-- (UI never exposed it, but the API allowed it).
--
-- Fix: BEFORE UPDATE trigger — plan/limit/code columns may only change when
-- the caller is the platform owner (is_platform_super, 0017 semantics).
-- Non-commercial edits (name, slug, contact info, settings jsonb) stay with
-- the org's admins as before. Idempotent.
-- ---------------------------------------------------------------------------

create or replace function public.protect_org_commercial_cols()
returns trigger
language plpgsql security definer set search_path = public
as $$
begin
  if new.plan_type     is distinct from old.plan_type
     or new.plan_status is distinct from old.plan_status
     or new.max_vehicles is distinct from old.max_vehicles
     or new.max_users   is distinct from old.max_users
     or new.client_code is distinct from old.client_code
     or new.business_type is distinct from old.business_type then
    if not coalesce(public.is_platform_super(), false) then
      raise exception
        'Only the platform owner may change plan, limits or client code'
        using errcode = '42501';
    end if;
  end if;
  return new;
end $$;

drop trigger if exists trg_protect_org_commercial_cols on public.organizations;
create trigger trg_protect_org_commercial_cols
  before update on public.organizations
  for each row execute function public.protect_org_commercial_cols();

-- ---------------------------------------------------------------------------
-- VERIFY (SQL editor):
--   select tgname from pg_trigger
--    where tgrelid = 'public.organizations'::regclass and tgisinternal = false;
--   -- As a client org admin via the API:
--   --   PATCH organizations?id=eq.<own org> {"max_users": 999} → 42501
--   -- As the platform owner in the app: plan dropdown / suspend toggle /
--   -- limit edits all keep working.
-- ---------------------------------------------------------------------------
