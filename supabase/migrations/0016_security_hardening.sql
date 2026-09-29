-- 0015 — Security hardening (pre-deployment audit findings)
-- ---------------------------------------------------------------------------
-- Closes every escalation/leak path proven live by audit probes on 2026-09-29.
-- Policy/trigger-only: no data is touched. Idempotent — safe to re-run.
--
-- C1. PRIVILEGE ESCALATION (CRITICAL) — profiles admin update policy lets any
--     org Admin update ANY profile row platform-wide, including platform_role
--     (added 0014) and role='Super Admin' (0001). One API call = platform
--     powers. Fix: BEFORE UPDATE trigger — platform_role and grants of
--     'Super Admin' may only be set by the platform owner; row scope of
--     profile updates narrowed to same-org via policy rewrite (C1b).
-- C1b. ROW-SCOPE (CRITICAL) — "profiles admins update"/"super admin delete"
--     are not restricted per-row: an org Admin could disable or re-role ANY
--     user platform-wide. Fix: policies re-scoped to can_manage_profile()
--     (same-org admin relationship) + platform team + self.
-- C2. PII LEAK (HIGH) — "profiles read" = any Active user reads EVERY profile
--     platform-wide (other companies' staff names/emails/roles — proven with
--     live probe: 9+ real users returned). Fix: own profile, platform team,
--     or same-org membership.
-- C3. CROSS-TENANT SETTINGS (MEDIUM) — "org_settings org read" let any Active
--     user read every org's booking presets/terminology. Fix: own-org row,
--     legacy platform NULL row, or platform team.
-- C4. SELF-INSERT ROLE (HIGH) — "profiles self insert" allowed a signup
--     fallback insert with role='Super Admin'. Fix: fallback inserts limited
--     to Staff/Driver, platform_role forced NULL.
-- C5. OWNER-FLAG ESCALATION (CRITICAL) — org Admins manage their org's
--     member rows ("members admins manage"), so they could self-grant
--     is_org_owner=true + role='Super Admin' in organization_members, which
--     is exactly what is_platform_super() checks → full cross-tenant access.
--     Fix: BEFORE INSERT/UPDATE trigger — ownership and Super Admin grants
--     require the platform owner (or the bootstrap case: the org's very
--     first member, which is how client-code signup and UI org creation
--     legitimately create the owner).
-- Plus: revoke anon execute on enroll_users (least privilege).
-- ---------------------------------------------------------------------------

-- C1 — profiles trigger: owner-only columns ----------------------------------
create or replace function public.protect_profile_privileges()
returns trigger
language plpgsql security definer set search_path = public
as $$
begin
  if (to_jsonb(new) ->> 'platform_role') is distinct from
     (to_jsonb(old) ->> 'platform_role') then
    if not coalesce(public.is_platform_super(), false) then
      raise exception 'Only the platform owner may change platform_role'
        using errcode = '42501';
    end if;
  end if;
  if new.role = 'Super Admin' and old.role <> 'Super Admin' then
    if not coalesce(public.is_platform_super(), false) then
      raise exception 'Only the platform owner may grant Super Admin'
        using errcode = '42501';
    end if;
  end if;
  return new;
end $$;

drop trigger if exists trg_protect_profile_privileges on public.profiles;
create trigger trg_protect_profile_privileges
  before update on public.profiles
  for each row execute function public.protect_profile_privileges();

-- C1b/C2 — profile row-scope helpers (SECURITY DEFINER: no RLS recursion) -----
create or replace function public.can_view_profile(p_profile_id text)
returns boolean
language sql stable security definer set search_path = public
as $$
  select p_profile_id = auth.uid()::text
      or public.is_platform_super()
      or public.is_platform_admin()
      or exists (
        select 1
        from public.organization_members mine
        join public.organization_members theirs
          on theirs.organization_id = mine.organization_id
        where mine.user_id::text  = auth.uid()::text
          and mine.status  = 'Active'
          and theirs.user_id::text = p_profile_id
          and theirs.status = 'Active'
      )
$$;

create or replace function public.can_manage_profile(p_profile_id text)
returns boolean
language sql stable security definer set search_path = public
as $$
  select p_profile_id = auth.uid()::text
      or public.is_platform_super()
      or public.is_platform_admin()
      or exists (
        select 1
        from public.organization_members mine
        join public.organization_members theirs
          on theirs.organization_id = mine.organization_id
        where mine.user_id::text  = auth.uid()::text
          and mine.status  = 'Active'
          and mine.role in ('Super Admin', 'Admin')
          and theirs.user_id::text = p_profile_id
          and theirs.status = 'Active'
      )
$$;

drop policy if exists "profiles read" on public.profiles;
create policy "profiles read" on public.profiles
  for select using (public.can_view_profile(id));

drop policy if exists "profiles admins update" on public.profiles;
create policy "profiles admins update" on public.profiles
  for update using (public.can_manage_profile(id))
  with check (public.can_manage_profile(id));

drop policy if exists "profiles super admin delete" on public.profiles;
create policy "profiles super admin delete" on public.profiles
  for delete using (public.can_manage_profile(id));

-- C3 — org_settings: own org only (plus legacy platform NULL row) -------------
drop policy if exists "org_settings org read" on public.org_settings;
create policy "org_settings org read" on public.org_settings
  for select using (
    organization_id is null
    or public.get_my_org_role(organization_id) is not null
    or public.is_platform_admin()
  );

-- C4 — signup-fallback self inserts can never grant elevated roles ------------
drop policy if exists "profiles self insert" on public.profiles;
create policy "profiles self insert" on public.profiles
  for insert with check (
    id = auth.uid()::text
    and role in ('Staff', 'Driver')
    and platform_role is null
  );

-- C5 — organization_members: no self-granted ownership / Super Admin ----------
create or replace function public.protect_member_escalation()
returns trigger
language plpgsql security definer set search_path = public
as $$
declare
  v_member_count int;
  v_is_owner_grant boolean;
  v_is_sa_grant boolean;
begin
  v_is_owner_grant := new.is_org_owner
    and (tg_op = 'INSERT' or old.is_org_owner = false);
  v_is_sa_grant := new.role = 'Super Admin'
    and (tg_op = 'INSERT' or old.role <> 'Super Admin');

  if not coalesce(v_is_owner_grant, false)
     and not coalesce(v_is_sa_grant, false) then
    return new;  -- normal team management, untouched
  end if;

  -- System context (SQL editor / service jobs): auth.uid() is null → allow.
  if auth.uid() is null then
    return new;
  end if;

  -- Bootstrap: creating the FIRST member of a brand-new org (client-code
  -- signup owner, or 0012 UI org creation). Zero current members = legit.
  if tg_op = 'INSERT' then
    select count(*) into v_member_count
    from public.organization_members
    where organization_id = new.organization_id;
    if v_member_count = 0 then
      return new;
    end if;
  end if;

  if not coalesce(public.is_platform_super(), false) then
    raise exception
      'Only the platform owner may grant org ownership or Super Admin'
      using errcode = '42501';
  end if;
  return new;
end $$;

drop trigger if exists trg_protect_member_escalation on public.organization_members;
create trigger trg_protect_member_escalation
  before insert or update on public.organization_members
  for each row execute function public.protect_member_escalation();

-- Least privilege — the enrollment RPC is authenticated-only.
-- Dynamic revoke: enroll_users may exist as one or two overloaded signatures
-- (0009 created (jsonb); 0012 added (jsonb, uuid)) — a hard REVOKE on a
-- missing signature would abort the run, so enumerate pg_proc instead.
do $$
declare r record;
begin
  for r in
    select oid::regprocedure as fn
    from pg_proc where proname = 'enroll_users' and pronamespace = 'public'::regnamespace
  loop
    execute format('revoke execute on function %s from anon', r.fn);
  end loop;
end $$;

-- ---------------------------------------------------------------------------
-- VERIFY (SQL editor):
--   select tgname from pg_trigger
--    where tgrelid in ('public.profiles'::regclass,
--                      'public.organization_members'::regclass)
--      and tgisinternal = false;
--   -- App checks after running:
--   --  * Settings user list shows ONLY your org's people
--   --  * profile PATCH role='Super Admin' / platform_role=… via API → 42501
--   --  * member PATCH is_org_owner=true via API (as org admin) → 42501
--   --  * client signup with a valid Client Code still creates owner+org
--   --  * UI org creation (Clients page, as you) still works (0012 path)
-- ---------------------------------------------------------------------------
