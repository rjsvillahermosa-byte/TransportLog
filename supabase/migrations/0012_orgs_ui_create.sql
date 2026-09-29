-- 0012 — Let platform supers create client organizations from the UI
-- ---------------------------------------------------------------------------
-- 0003 gave organizations read/update policies but never an INSERT policy,
-- and RLS denies by default. SQL-editor inserts bypassed RLS (which is why
-- TLF-001 exists), but the Clients page modal failed with
-- "new row violates row-level security policy for table organizations".
--
-- Two problems, fixed together:
--   1) no insert path        -> policy: platform supers (Super Admin +
--                               is_org_owner) may create organizations
--   2) the first-member trap -> after-insert trigger makes the CREATING super
--                               a Super Admin member of the new org, so the
--                               members UI can manage it immediately.
--                               (Without this, the members-manage policy —
--                               which requires already being an admin of that
--                               org — could never be satisfied for a new org.)

-- 1) org creation is a platform-owner action
drop policy if exists "orgs super insert" on public.organizations;
create policy "orgs super insert" on public.organizations
  for insert to authenticated
  with check (public.is_platform_super());

-- 2) creator becomes the new org's first Super Admin member
create or replace function public.add_creator_as_org_admin()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is not null then
    insert into public.organization_members
      (organization_id, user_id, role, is_org_owner, status)
    values (new.id, auth.uid(), 'Super Admin', false, 'Active')
    on conflict do nothing;
  end if;
  return new;
end;
$$;

drop trigger if exists on_org_created_add_creator on public.organizations;
create trigger on_org_created_add_creator
  after insert on public.organizations
  for each row execute function public.add_creator_as_org_admin();

-- ---------------------------------------------------------------------------
-- 3) enroll_users upgrade: optional org target so a platform owner who is
--    admin of several orgs can onboard a SPECIFIC client's team. Existing
--    single-argument calls keep working (default = caller's first org).

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

  select exists (
    select 1 from public.organization_members
    where user_id = v_caller and role = 'Super Admin' and is_org_owner
  ) into v_is_super;

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

-- ---------------------------------------------------------------------------
-- VERIFY (SQL editor):
--   -- as the platform owner in the app: Clients -> New client organization
--   -- should now succeed; check:
--   select o.client_code, o.name, m.role, m.is_org_owner
--   from public.organizations o
--   left join public.organization_members m on m.organization_id = o.id
--   order by o.created_date desc limit 5;
--   -- the new org row has a 'Super Admin' member (its creator) + a settings
--   -- row (from 0008's trigger)
-- ---------------------------------------------------------------------------
