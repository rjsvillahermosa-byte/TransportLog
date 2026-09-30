-- 0030 — Vehicle QR binding + pre-mission checklist
-- ---------------------------------------------------------------------------
-- 1) vehicles.vehicle_qr_token: public-safe random token embedded in the
--    printed QR on each vehicle. Scanning ${origin}/v/<token> identifies THE
--    physical vehicle (no uuid in the URL, tokens are revocable).
-- 2) mileage_logs gains the binding + audit record:
--      vehicle_id            — which physical vehicle (QR-verified)
--      vehicle_qr_verified   — the log was created via/with the vehicle QR
--      checklist             — pre-mission checklist answers (jsonb)
--      checklist_completed_at— when the driver finished the walk-around
-- Idempotent. Run in the SQL editor.
-- ---------------------------------------------------------------------------

alter table public.vehicles
  add column if not exists vehicle_qr_token text;

-- Unique, non-null tokens for every vehicle (existing + future).
update public.vehicles
   set vehicle_qr_token = encode(gen_random_bytes(12), 'hex')
 where vehicle_qr_token is null;

alter table public.vehicles
  alter column vehicle_qr_token set default encode(gen_random_bytes(12), 'hex');

create unique index if not exists vehicles_qr_token_uidx
  on public.vehicles (vehicle_qr_token);

-- Lookup by token must work for ANY signed-in user (the scan page resolves
-- the vehicle before RLS org checks apply to the rest of the row).
-- We do this with a SECURITY DEFINER function instead of opening SELECT.
-- NOTE: vehicles.id is TEXT in this legacy schema (same quirk as
-- transport_requests.id) — the return type must say `id text`, NOT uuid,
-- or the function fails with 42P13 (return type mismatch).
create or replace function public.vehicle_by_qr_token(p_token text)
returns table (
  id text, plate_number text, unit_name text, model text,
  organization_id uuid, organization_name text,
  start_odometer_km integer, status text
)
language sql stable security definer set search_path = public
as $$
  select v.id::text, v.plate_number, v.unit_name, v.model,
         v.organization_id, o.name,
         v.start_odometer_km, v.status
  from public.vehicles v
  left join public.organizations o on o.id = v.organization_id
  where v.vehicle_qr_token = p_token
  limit 1;
$$;

-- mileage_logs: QR binding + checklist. vehicle_id stays TEXT to match the
-- legacy vehicles.id (no FK — cross-type references aren't supported; the
-- app treats ids as opaque strings).
alter table public.mileage_logs
  add column if not exists vehicle_id text,
  add column if not exists vehicle_qr_verified boolean not null default false,
  add column if not exists checklist jsonb,
  add column if not exists checklist_completed_at timestamptz;

-- Checklist submissions from the vehicle scan page. Any signed-in user may
-- file one (drivers check before they have a mission attached); reads are
-- org-scoped. Platform team + org admins can audit them.
create table if not exists public.pending_vehicle_checklists (
  id          uuid primary key default gen_random_uuid(),
  vehicle_id  text not null,
  plate_number text,
  answers     jsonb not null default '{}'::jsonb,
  completed_at timestamptz not null default now(),
  created_by  text,
  organization_id uuid
);
alter table public.pending_vehicle_checklists enable row level security;
drop policy if exists "checklists insert" on public.pending_vehicle_checklists;
create policy "checklists insert" on public.pending_vehicle_checklists
  for insert with check (auth.role() = 'authenticated');
drop policy if exists "checklists read" on public.pending_vehicle_checklists;
create policy "checklists read" on public.pending_vehicle_checklists
  for select using (
    public.is_platform_admin()
    or (organization_id is not null and public.get_my_org_role(organization_id) is not null)
  );

-- ---------------------------------------------------------------------------
-- VERIFY:
--   select plate_number, vehicle_qr_token from vehicles;
--   select * from vehicle_by_qr_token('<paste a token>');  -- resolves w/o RLS org scope
-- ---------------------------------------------------------------------------
