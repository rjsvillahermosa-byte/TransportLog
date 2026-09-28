-- ============================================================================
-- TEST KIT: 0003 tenant-isolation, end to end
-- Run in Supabase SQL Editor AFTER 0003_saas_tenancy.sql is applied.
-- Safe to re-run. All fixtures are clearly named TEST-* / ISO-TEST-*.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1) Provision two test organizations
-- ---------------------------------------------------------------------------
insert into public.organizations (client_code, name, slug, business_type, plan_type, max_vehicles, max_users)
values
  ('ISO-TEST-A', 'Isolation Test Org A', 'iso-test-a', 'hotel', 'starter', 2, 5),
  ('ISO-TEST-B', 'Isolation Test Org B', 'iso-test-b', 'hotel', 'starter', 2, 5)
on conflict (client_code) do nothing;

-- ---------------------------------------------------------------------------
-- 2) Seed one vehicle per org (as platform admin)
-- ---------------------------------------------------------------------------
insert into public.vehicles (organization_id, plate_number, unit_name, model, fuel_type)
select id, 'TEST-A-001', 'Van A1', 'Toyota Hiace', 'diesel' from public.organizations where client_code = 'ISO-TEST-A'
on conflict do nothing;

insert into public.vehicles (organization_id, plate_number, unit_name, model, fuel_type)
select id, 'TEST-B-001', 'Van B1', 'Toyota Vios', 'gasoline' from public.organizations where client_code = 'ISO-TEST-B'
on conflict do nothing;

-- ---------------------------------------------------------------------------
-- 3) Create two throwaway auth users (email + password, email_confirm true).
--    Requires the service role — the SQL Editor runs as postgres, so this works.
--    Passwords are throwaway; org codes are random-ish to avoid collisions.
-- ---------------------------------------------------------------------------
do $$
declare
  ua uuid; ub uuid;
  code_a text := 'ISO-TEST-A';
  code_b text := 'ISO-TEST-B';
begin
  -- user A → org A
  insert into auth.users (instance_id, id, aud, role, email, encrypted_password,
                          email_confirmed_at, raw_app_meta_data, raw_user_meta_data,
                          created_at, updated_at)
  values ('00000000-0000-0000-0000-000000000000', gen_random_uuid(),
          'authenticated', 'authenticated',
          'iso.test.a.' || floor(random()*100000)::text || '@fleetflow.test',
          crypt('IsoTest!123', gen_salt('bf')),
          now(),
          '{"provider":"email","providers":["email"]}',
          jsonb_build_object('full_name', 'Iso Test A', 'client_code', code_a),
          now(), now())
  returning id into ua;

  -- user B → org B
  insert into auth.users (instance_id, id, aud, role, email, encrypted_password,
                          email_confirmed_at, raw_app_meta_data, raw_user_meta_data,
                          created_at, updated_at)
  values ('00000000-0000-0000-0000-000000000000', gen_random_uuid(),
          'authenticated', 'authenticated',
          'iso.test.b.' || floor(random()*100000)::text || '@fleetflow.test',
          crypt('IsoTest!123', gen_salt('bf')),
          now(),
          '{"provider":"email","providers":["email"]}',
          jsonb_build_object('full_name', 'Iso Test B', 'client_code', code_b),
          now(), now())
  returning id into ub;

  -- The auth.users trigger only fires via the auth API (GoTrue), NOT for raw
  -- SQL inserts — so materialize memberships + profiles directly here.
  insert into public.organization_members (organization_id, user_id, role, is_org_owner)
  select id, ua, 'Super Admin', true from public.organizations where client_code = code_a
  on conflict do nothing;

  insert into public.organization_members (organization_id, user_id, role, is_org_owner)
  select id, ub, 'Super Admin', true from public.organizations where client_code = code_b
  on conflict do nothing;

  insert into public.profiles (id, full_name, email, role, status)
  values (ua::text, 'Iso Test A', 'iso.test.a.' || ua::text || '@fleetflow.test', 'Staff', 'Active'),
         (ub::text, 'Iso Test B', 'iso.test.b.' || ub::text || '@fleetflow.test', 'Staff', 'Active')
  on conflict (id) do nothing;

  raise notice 'user A=%  user B=%', ua, ub;
end $$;

-- ---------------------------------------------------------------------------
-- 4) THE ISOLATION TEST — impersonate each client and count visible vehicles.
--    set_config('role','authenticated') + request.jwt.claims mimics the API
--    gate exactly (that's what PostgREST does before running your query).
-- ---------------------------------------------------------------------------
do $$
declare
  r  record;
  n  integer;
  own integer;
begin
  for r in
    select o.client_code, m.user_id from public.organization_members m
      join public.organizations o on o.id = m.organization_id
     where o.client_code in ('ISO-TEST-A','ISO-TEST-B') and m.is_org_owner
     order by o.client_code
  loop
    perform set_config('role', 'authenticated', true);
    perform set_config('request.jwt.claims',
      json_build_object('sub', r.user_id::text, 'role', 'authenticated')::text, true);

    select count(*) into n from public.vehicles;
    select count(*) into own from public.vehicles v
      join public.organization_members m2 on m2.organization_id = v.organization_id
     where m2.user_id = r.user_id;

    reset role;

    if n = own and own = 1 then
      raise notice '% sees % vehicle(s), all their own — PASS ✅', r.client_code, n;
    else
      raise notice '% sees % vehicle(s), % own — FAIL ❌ (cross-tenant leak or own rows hidden)',
        r.client_code, n, own;
    end if;
  end loop;
  raise notice 'PASS = each client sees exactly their own 1 vehicle (TEST-A-001 / TEST-B-001)';
end $$;

-- ---------------------------------------------------------------------------
-- 5) Write-path check — client B must NOT be able to create a row in org A.
--    Expected output: 'blocked' (exception caught). 'LEAK' = RLS failure.
-- ---------------------------------------------------------------------------
do $$
declare
  ub uuid; org_a uuid; leaked boolean := false;
begin
  select m.user_id into ub from public.organization_members m
    join public.organizations o on o.id = m.organization_id
   where o.client_code = 'ISO-TEST-B' and m.is_org_owner;
  select id into org_a from public.organizations where client_code = 'ISO-TEST-A';

  begin
    set_config('role', 'authenticated', true);
    set_config('request.jwt.claims',
      json_build_object('sub', ub::text, 'role', 'authenticated')::text, true);
    insert into public.vehicles (organization_id, plate_number, model, fuel_type)
    values (org_a, 'TEST-B-WRITE', 'Should not exist', 'diesel');
    leaked := true;
  exception when insufficient_privilege or check_violation then
    leaked := false;  -- RLS rejected it — correct
  end;

  reset role;
  raise notice 'cross-org insert: %', case when leaked then 'LEAK ❌' else 'blocked ✅' end;
end $$;

-- ---------------------------------------------------------------------------
-- 6) Plan-limit paywall — org A allows 2 vehicles; third insert must fail.
--    Expected output: 'paywall works ✅' (or 'already at limit ✅' if a prior
--    run added the third vehicle).
-- ---------------------------------------------------------------------------
do $$
declare org_a uuid; n integer; maxv integer;
begin
  select id into org_a from public.organizations where client_code = 'ISO-TEST-A';
  select count(*), max(max_vehicles) into n, maxv
    from public.vehicles v join public.organizations o on o.id = v.organization_id
   where v.organization_id = org_a;

  if n >= maxv then
    raise notice 'already at limit ✅';
    return;
  end if;

  begin
    insert into public.vehicles (organization_id, plate_number, model, fuel_type)
    values (org_a, 'TEST-A-002', 'Within plan', 'diesel');
    raise notice 'second vehicle inserted (within plan) ✅';
  exception when others then
    raise notice 'unexpected early paywall ❌: %', sqlerrm;
  end;

  begin
    insert into public.vehicles (organization_id, plate_number, model, fuel_type)
    values (org_a, 'TEST-A-003', 'Should hit paywall', 'diesel');
    raise notice 'paywall FAILED ❌ — third vehicle inserted';
  exception when insufficient_privilege or check_violation then
    raise notice 'paywall works ✅';
  end;
end $$;

-- ---------------------------------------------------------------------------
-- 7) CLEANUP — remove every test fixture (re-run anytime)
-- ---------------------------------------------------------------------------
do $$
declare r record;
begin
  -- memberships + users first (members cascade on user delete)
  for r in
    select m.user_id from public.organization_members m
      join public.organizations o on o.id = m.organization_id
     where o.client_code in ('ISO-TEST-A','ISO-TEST-B')
  loop
    delete from auth.users where id = r.user_id;
  end loop;

  delete from public.vehicles where plate_number like 'TEST-%';
  delete from public.organizations where client_code in ('ISO-TEST-A','ISO-TEST-B');
  delete from public.profiles where email like 'iso.test.%@fleetflow.test';

  raise notice 'cleanup done';
end $$;
