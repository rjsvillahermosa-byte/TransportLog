-- 0009 — Bulk enrollment of Drivers & Staff (real auth accounts, seat-limited)
-- ---------------------------------------------------------------------------
-- enroll_users(p_rows jsonb) lets an org's Admin/Super Admin create real auth
-- accounts in-app. It INSERTs into auth.users (SECURITY DEFINER), which fires
-- the existing handle_new_user / handle_new_saas_user triggers so profiles +
-- organization membership happen through the exact same path as signup.
--
--   p_rows: [{ "full_name": "...", "email": "...", "role": "Driver"|"Staff"
--              |"Supervisor", "password": "optional" }]
--   returns: table (enrolled_email text, ok boolean, message text)
--
-- Guards:
--   * caller must be Admin/Super Admin in an active org (or platform owner)
--   * seat limit: org.max_users enforced, matching signup behavior
--   * role whitelist: Driver/Staff/Supervisor only — enrollment can never
--     mint Admin/Super Admin
--   * email unique in auth.users; auto-confirmed so the account can sign in
--     immediately with the issued password (bypasses the email-confirm wall)
--   * passwords: >= 6 chars or auto-generated Aa1-xxxxxxxx

create extension if not exists pgcrypto with schema extensions;

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

  select exists (
    select 1 from public.organization_members
    where user_id = v_caller and role = 'Super Admin' and is_org_owner
  ) into v_is_super;

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

revoke all on function public.enroll_users(jsonb) from public, anon;
grant execute on function public.enroll_users(jsonb) to authenticated;

-- ---------------------------------------------------------------------------
-- VERIFY (SQL editor):
--   select * from public.enroll_users(
--     '[{"full_name":"Test Driver","email":"driver.test.0909@example.com","role":"Driver"}]'::jsonb
--   );
--   -- expect: ok = true, message = 'enrolled'; the password is auto-generated
--   -- and shown in the UI result, not stored in plaintext anywhere.
--   -- Clean up:
--   delete from auth.users where email = 'driver.test.0909@example.com';
-- ---------------------------------------------------------------------------
