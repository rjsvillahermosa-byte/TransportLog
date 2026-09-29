-- 0018 — Redirect the three remaining inline "is_org_owner" checks through
-- the now-fixed is_platform_super() (see 0017's "KNOWN REMAINING GAP" note)
-- ---------------------------------------------------------------------------
-- enroll_users() (0009, and its 2-arg overload from 0012), and
-- audit_start_odo_change() (0011), each inlined their own copy of:
--   exists (select 1 from organization_members
--           where user_id = <uid> and role = 'Super Admin' and is_org_owner)
-- instead of calling is_platform_super(). Redefining is_platform_super() in
-- 0017 didn't touch these — they never called it, they repeated its old,
-- unscoped logic directly. This migration replaces that one subquery in each
-- function with a call to is_platform_super(), and changes nothing else:
-- every other line below is copied unchanged from the currently-live body.
--
-- Narrower blast radius than 0016/0017 (bulk-enroll seat-limit bypass,
-- odometer-audit bypass — not cross-tenant data read/write), and in
-- enroll_users()'s case the old bug was already inert in practice because
-- organization_members.organization_id is NOT NULL and the caller's v_org
-- was null on that path, so the insert always failed downstream anyway —
-- fixed here for correctness and to remove reliance on that accidental
-- safety net, not because it was independently exploitable today.
-- ---------------------------------------------------------------------------

-- 1) enroll_users(p_rows jsonb) — 0009's original 1-arg signature -----------
create or replace function public.enroll_users(p_rows jsonb)
returns table (enrolled_email text, ok boolean, message text)
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_caller   uuid := auth.uid();
  v_org      uuid;
  v_role     text;
  v_count    integer;
  v_max      integer;
  v_is_super boolean;
  r          jsonb;
  v_email    text;
  v_name     text;
  v_pass     text;
  v_row_role text;
  v_new_id   uuid;
begin
  if v_caller is null then
    raise exception 'Not authenticated';
  end if;

  -- caller's active org + role
  select m.organization_id, m.role into v_org, v_role
  from public.organization_members m
  where m.user_id = v_caller and m.status = 'Active'
  order by (m.role in ('Super Admin','Admin')) desc, m.joined_at
  limit 1;

  v_is_super := public.is_platform_super();

  if v_org is null or v_role not in ('Super Admin','Admin') then
    if not v_is_super then
      raise exception 'Only Admin or Super Admin can enroll users';
    end if;
  end if;

  -- current seat usage vs the org's limit
  select count(*), coalesce(max(o.max_users), 0) into v_count, v_max
  from public.organization_members m
  join public.organizations o on o.id = m.organization_id
  where m.organization_id = v_org;

  for r in select * from jsonb_array_elements(p_rows)
  loop
    v_email    := lower(btrim(coalesce(r ->> 'email', '')));
    v_name     := btrim(coalesce(r ->> 'full_name', ''));
    v_row_role := coalesce(r ->> 'role', 'Staff');
    v_pass     := coalesce(nullif(btrim(r ->> 'password'), ''), '');
    v_new_id   := null;

    begin
      if v_email !~ '^[^@]+@[^@]+\.[^@]+$' then
        enrolled_email := v_email; ok := false;
        message := 'invalid email';
        return next;
        continue;
      end if;

      if v_row_role not in ('Driver','Staff','Supervisor') then
        enrolled_email := v_email; ok := false;
        message := 'role must be Driver, Staff or Supervisor';
        return next;
        continue;
      end if;

      if v_name = '' then
        enrolled_email := v_email; ok := false;
        message := 'full name required';
        return next;
        continue;
      end if;

      if exists (select 1 from auth.users u where lower(u.email) = v_email) then
        enrolled_email := v_email; ok := false;
        message := 'email already registered';
        return next;
        continue;
      end if;

      if v_count >= v_max then
        enrolled_email := v_email; ok := false;
        message := format('seat limit reached (%s/%s)', v_count, v_max);
        return next;
        continue;
      end if;

      if char_length(v_pass) < 6 then
        v_pass := 'Aa1-' || substr(md5(random()::text || clock_timestamp()::text), 1, 8);
      end if;

      insert into auth.users (
        instance_id, id, aud, "role", email, encrypted_password,
        email_confirmed_at, raw_app_meta_data, raw_user_meta_data,
        created_at, updated_at, confirmation_token, recovery_token,
        email_change_token_new, email_change
      ) values (
        '00000000-0000-0000-0000-000000000000', gen_random_uuid(),
        'authenticated', 'authenticated',
        v_email, extensions.crypt(v_pass, extensions.gen_salt('bf')),
        now(), '{"provider":"email","providers":["email"]}'::jsonb,
        jsonb_build_object('full_name', v_name, 'enrolled_by', v_caller),
        now(), now(), '', '', '', ''
      ) returning id into v_new_id;

      -- handle_new_user created the profile; handle_new_saas_user (if the
      -- org row came from a client-code org) or nothing linked membership.
      -- Guarantee membership in the CALLER's org with the requested role:
      insert into public.organization_members (organization_id, user_id, role, is_org_owner)
      values (v_org, v_new_id, v_row_role, false)
      on conflict do nothing;

      update public.organization_members
         set role = v_row_role
       where user_id = v_new_id
         and organization_id = v_org
         and role <> v_row_role;

      v_count := v_count + 1;
      enrolled_email := v_email; ok := true;
      message := 'enrolled';
      return next;
    exception when others then
      enrolled_email := v_email; ok := false;
      message := coalesce(sqlerrm, 'failed');
      return next;
    end;
  end loop;
end;
$$;

-- 2) enroll_users(p_rows jsonb, p_org uuid) — 0012's overload ----------------
create or replace function public.enroll_users(p_rows jsonb, p_org uuid default null)
returns table (enrolled_email text, ok boolean, message text)
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_caller   uuid := auth.uid();
  v_org      uuid;
  v_role     text;
  v_count    integer;
  v_max      integer;
  v_is_super boolean;
  r          jsonb;
  v_email    text;
  v_name     text;
  v_pass     text;
  v_row_role text;
  v_new_id   uuid;
begin
  if v_caller is null then
    raise exception 'Not authenticated';
  end if;

  v_is_super := public.is_platform_super();

  if p_org is not null then
    -- explicit target: caller must admin THAT org (or be the platform owner)
    if not v_is_super then
      select m.role into v_role from public.organization_members m
      where m.user_id = v_caller and m.organization_id = p_org and m.status = 'Active';
      if v_role not in ('Super Admin','Admin') then
        raise exception 'Only Admin or Super Admin can enroll users into this organization';
      end if;
    end if;
    v_org := p_org;
  else
    -- default: caller's first active org (admin-ness required as before)
    select m.organization_id, m.role into v_org, v_role
    from public.organization_members m
    where m.user_id = v_caller and m.status = 'Active'
    order by (m.role in ('Super Admin','Admin')) desc, m.joined_at
    limit 1;
    if v_org is null or v_role not in ('Super Admin','Admin') then
      if not v_is_super then
        raise exception 'Only Admin or Super Admin can enroll users';
      end if;
    end if;
  end if;

  select count(*), coalesce(max(o.max_users), 0) into v_count, v_max
  from public.organization_members m
  join public.organizations o on o.id = m.organization_id
  where m.organization_id = v_org;

  for r in select * from jsonb_array_elements(p_rows)
  loop
    v_email    := lower(btrim(coalesce(r ->> 'email', '')));
    v_name     := btrim(coalesce(r ->> 'full_name', ''));
    v_row_role := coalesce(r ->> 'role', 'Staff');
    v_pass     := coalesce(nullif(btrim(r ->> 'password'), ''), '');
    v_new_id   := null;

    begin
      if v_email !~ '^[^@]+@[^@]+\.[^@]+$' then
        enrolled_email := v_email; ok := false;
        message := 'invalid email';
        return next;
        continue;
      end if;

      if v_row_role not in ('Driver','Staff','Supervisor') then
        enrolled_email := v_email; ok := false;
        message := 'role must be Driver, Staff or Supervisor';
        return next;
        continue;
      end if;

      if v_name = '' then
        enrolled_email := v_email; ok := false;
        message := 'full name required';
        return next;
        continue;
      end if;

      if exists (select 1 from auth.users u where lower(u.email) = v_email) then
        enrolled_email := v_email; ok := false;
        message := 'email already registered';
        return next;
        continue;
      end if;

      if v_count >= v_max then
        enrolled_email := v_email; ok := false;
        message := format('seat limit reached (%s/%s)', v_count, v_max);
        return next;
        continue;
      end if;

      if char_length(v_pass) < 6 then
        v_pass := 'Aa1-' || substr(md5(random()::text || clock_timestamp()::text), 1, 8);
      end if;

      insert into auth.users (
        instance_id, id, aud, "role", email, encrypted_password,
        email_confirmed_at, raw_app_meta_data, raw_user_meta_data,
        created_at, updated_at, confirmation_token, recovery_token,
        email_change_token_new, email_change
      ) values (
        '00000000-0000-0000-0000-000000000000', gen_random_uuid(),
        'authenticated', 'authenticated',
        v_email, extensions.crypt(v_pass, extensions.gen_salt('bf')),
        now(), '{"provider":"email","providers":["email"]}'::jsonb,
        jsonb_build_object('full_name', v_name, 'enrolled_by', v_caller),
        now(), now(), '', '', '', ''
      ) returning id into v_new_id;

      insert into public.organization_members (organization_id, user_id, role, is_org_owner)
      values (v_org, v_new_id, v_row_role, false)
      on conflict do nothing;

      update public.organization_members
         set role = v_row_role
       where user_id = v_new_id
         and organization_id = v_org
         and role <> v_row_role;

      v_count := v_count + 1;
      enrolled_email := v_email; ok := true;
      message := 'enrolled';
      return next;
    exception when others then
      enrolled_email := v_email; ok := false;
      message := coalesce(sqlerrm, 'failed');
      return next;
    end;
  end loop;
end;
$$;

-- 3) audit_start_odo_change() — 0011 -----------------------------------------
create or replace function public.audit_start_odo_change()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid      uuid := auth.uid();
  v_email    text;
  v_role     text;
  v_allowed  boolean := false;
begin
  if new.start_odometer_km is not distinct from old.start_odometer_km then
    return new;  -- nothing changed — pass through
  end if;

  if v_uid is null then
    -- Server-side session (SQL editor / service role): allowed, logged as system.
    v_allowed := true;
    v_role := 'system';
    v_email := null;
  else
    select email into v_email from auth.users where id = v_uid;
    select m.role into v_role
    from public.organization_members m
    where m.user_id = v_uid and m.organization_id = new.organization_id
      and m.status = 'Active';

    v_allowed :=
      v_role in ('Super Admin', 'Admin')
      or public.is_platform_super();
  end if;

  if not v_allowed then
    raise exception
      'Only Admin or Super Admin can change the vehicle baseline odometer (changes are audit-logged)';
  end if;

  insert into public.odometer_audit (
    vehicle_id, plate_number, organization_id,
    old_value, new_value, changed_by, changed_by_email, changed_by_role
  ) values (
    new.id, new.plate_number, new.organization_id,
    old.start_odometer_km, new.start_odometer_km,
    v_uid, v_email, coalesce(v_role, 'system')
  );

  return new;
end;
$$;

-- 4) Cleanup — 3 undocumented, redundant policies found during the audit ----
-- "View org drivers/vehicles/fuel logs" (organization_id in
-- (select get_my_org_ids())) exist only on these 3 tables, aren't in any
-- migration, and are functionally a strict subset of what *_org_scoped
-- already grants (same condition, minus the is_platform_super()/
-- is_platform_admin() OR-branches) — multiple permissive policies only ever
-- add access, so dropping a strictly-narrower duplicate changes nothing.
-- Dropped for hygiene: undocumented policies are how this kind of drift
-- happens in the first place.
drop policy if exists "View org drivers" on public.drivers;
drop policy if exists "View org vehicles" on public.vehicles;
drop policy if exists "View org fuel logs" on public.fuel_logs;

-- ---------------------------------------------------------------------------
-- VERIFY (SQL editor):
--   select public.is_platform_super();  -- as you: true; as anyone else: false
--   -- bulk-enroll and odometer-baseline edits should behave exactly as
--   -- before for every legitimate Admin/Super Admin/platform-owner case —
--   -- this migration only changes who the FALSE case was for.
--   select tablename, policyname from pg_policies
--   where tablename in ('drivers','vehicles','fuel_logs') order by tablename;
--   -- each should show exactly one *_org_scoped policy now.
-- ============================================================================
