-- 0011 — Baseline ODO is admin-editable only, with a full audit trail
-- ---------------------------------------------------------------------------
-- Rules implemented at the DATABASE level (survives direct API edits):
--   * vehicles.start_odometer_km may only change when the actor is an
--     Admin/Super Admin of the vehicle's org, the platform owner
--     (Super Admin + is_org_owner), or a server-side session
--     (SQL editor / service role — auth.uid() is null there; logged as system)
--   * EVERY change is recorded in odometer_audit: old value, new value,
--     who (id, email, role), when, and the org it belongs to.

create table if not exists public.odometer_audit (
  id               uuid primary key default gen_random_uuid(),
  vehicle_id       text not null,
  plate_number     text,
  organization_id  uuid references public.organizations(id),
  old_value        integer,
  new_value        integer not null,
  changed_by       uuid,
  changed_by_email text,
  changed_by_role  text,           -- 'Admin' | 'Super Admin' | 'system'
  changed_at       timestamptz not null default now()
);

create index if not exists odometer_audit_vehicle_idx
  on public.odometer_audit (vehicle_id, changed_at desc);

alter table public.odometer_audit enable row level security;

-- members read their own org's audit trail; platform supers read all
drop policy if exists "odometer_audit org read" on public.odometer_audit;
create policy "odometer_audit org read" on public.odometer_audit
  for select using (
    public.assert_org_access(organization_id) or public.is_platform_super()
  );
-- no insert/update/delete policies on purpose: rows are written exclusively
-- by the SECURITY DEFINER trigger below.

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
      or exists (
        select 1 from public.organization_members
        where user_id = v_uid and role = 'Super Admin' and is_org_owner
      );
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

drop trigger if exists on_vehicle_odo_change on public.vehicles;
create trigger on_vehicle_odo_change
  before update on public.vehicles
  for each row execute function public.audit_start_odo_change();

-- ---------------------------------------------------------------------------
-- VERIFY (SQL editor, after 0003+ org stamping exists on vehicles):
--   select plate_number, start_odometer_km from public.vehicles;
--   update public.vehicles set start_odometer_km = 12345 where plate_number = 'TEST';
--   select plate_number, old_value, new_value, changed_by_role, changed_at
--   from public.odometer_audit order by changed_at desc limit 5;
--   -- dashboard edits: allowed, role = 'system'
--   -- in-app as Driver/Staff: update fails with the exception message
--   -- in-app as Admin: succeeds + audit row with your email
-- ---------------------------------------------------------------------------
