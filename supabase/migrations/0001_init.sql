-- ============================================================================
-- TransportLog (FleetFlow) — initial schema  v2
-- Aligned 1:1 with the app's entity shapes in src/lib/db.js so the same UI
-- code runs unchanged on localStorage (offline) or Supabase (shared).
--
-- Key decisions:
--   • TEXT primary keys everywhere — the app generates IDs client-side,
--     which is what makes offline-created rows insert cleanly later
--     (offline-first sync needs conflict-free client IDs).
--   • created_date instead of created_at — matches the app's field name.
--   • Status vocabularies match the UI exactly (Pending / In Progress /
--     Completed; errand booking_type; vehicle status 'in use' with a space).
--   • vehicles/drivers referenced by plate/name strings on ops tables
--     (vehicle_id / assigned_driver_id kept as optional text for future FKs).
-- ============================================================================

-- ---------------------------------------------------------------------------
-- profiles — one row per auth.users; carries the app role/status
-- ---------------------------------------------------------------------------
create table public.profiles (
  id text primary key,                       -- auth uid (uuid as text)
  full_name text not null,
  email text not null unique,
  password text,                             -- local mode only; unused in Supabase
  role text not null default 'Staff'
    check (role in ('Super Admin', 'Admin', 'Supervisor', 'Driver', 'Staff')),
  status text not null default 'Active' check (status in ('Active', 'Disabled')),
  created_date timestamptz not null default now()
);

-- First-ever signup becomes the Super Admin (there can only be one);
-- everyone else starts as Staff until an admin promotes them.
create function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  insert into public.profiles (id, full_name, email, role)
  values (
    new.id::text,
    coalesce(new.raw_user_meta_data ->> 'full_name', split_part(new.email, '@', 1)),
    new.email,
    case when (select count(*) from public.profiles) = 0 then 'Super Admin' else 'Staff' end
  );
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ---------------------------------------------------------------------------
-- drivers
-- ---------------------------------------------------------------------------
create table public.drivers (
  id text primary key default (gen_random_uuid())::text,
  full_name text not null,
  employee_id text,
  contact_number text,
  email text,
  license_number text,
  license_expiry date,
  license_photo text,            -- data URL or storage URL
  avatar text,                   -- cute AI avatar (data URL or storage URL)
  assigned_vehicle_plate text,
  status text not null default 'Active',
  notes text,
  created_date timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- vehicles
-- ---------------------------------------------------------------------------
create table public.vehicles (
  id text primary key default (gen_random_uuid())::text,
  plate_number text not null,
  unit_name text,
  model text,
  status text not null default 'available',
  image_url text,
  fuel_type text not null default 'diesel',
  tank_liters integer default 60,
  rated_km_per_liter numeric default 9,
  pms_interval_km integer default 10000,
  pms_interval_months integer default 6,
  registration_expiry date,
  insurance_expiry date,
  registration_photo text,
  insurance_photo text,
  tire_life_km integer default 40000,
  tire_changed_odometer integer,
  created_date timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- service_logs — PMS / repairs / tire replacement (asset records)
-- ---------------------------------------------------------------------------
create table public.service_logs (
  id text primary key default (gen_random_uuid())::text,
  vehicle_plate text not null,
  vehicle_id text,               -- optional future FK to vehicles.id
  service_type text not null,
  service_date date not null,
  odometer_at_service integer,
  next_service_km integer,
  next_service_date date,
  service_provider text,
  casa text,
  cost numeric,
  notes text,
  source text default 'manual',  -- 'manual' | 'ocr'
  report_photo text,             -- casa report photo
  parts jsonb default '[]'::jsonb,
  recommendations jsonb default '[]'::jsonb,
  created_date timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- fuel_logs — fill-ups audited by the consumption engine
-- ---------------------------------------------------------------------------
create table public.fuel_logs (
  id text primary key default (gen_random_uuid())::text,
  vehicle_plate text not null,
  fill_date date not null,
  odometer integer not null,
  liters numeric not null,
  cost numeric not null,
  full_tank boolean default true,
  station text,
  receipt_photo text,
  encoded_by text,
  created_date timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- transport_requests — guest bookings + department errands
-- ---------------------------------------------------------------------------
create table public.transport_requests (
  id text primary key default (gen_random_uuid())::text,
  mission_id text not null,
  requester_type text not null default 'Guest',  -- 'Guest' | 'Errand'
  requested_by text,
  guest_name text not null,
  pax_count integer default 1,
  booking_type text not null,                    -- Drop-off / Airport Pick-up / Special Request / Other / Errand
  pickup_location text,
  destination text,
  schedule_date date not null,
  schedule_time text,                            -- 'HH:mm' (matches the app)
  assigned_driver_id text,
  assigned_driver_name text,
  vehicle_id text,
  vehicle_plate text,
  department text,
  special_notes text,
  booked_by text,
  status text not null default 'Pending'
    check (status in ('Pending', 'In Progress', 'Completed')),
  created_date timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- mileage_logs — one per mission leg (ODO capture start → end)
-- ---------------------------------------------------------------------------
create table public.mileage_logs (
  id text primary key default (gen_random_uuid())::text,
  request_id text not null,
  mission_id text,
  driver_id text,
  driver_name text,
  vehicle_plate text,
  guest_name text,
  requester_type text default 'Guest',
  department text,
  pax_count integer,
  booking_type text,
  pickup_location text,
  destination text,
  time_out timestamptz,
  time_in timestamptz,
  start_odometer integer,
  end_odometer integer,
  distance integer,              -- app-computed (end − start), kept explicit
  odo_start_photo text,
  odo_end_photo text,
  remarks text,
  status text default 'Completed',
  route_coordinates text,        -- JSON string of [{lat,lng,ts}]
  created_date timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- incidents — voice/FO reported events with timestamps
-- ---------------------------------------------------------------------------
create table public.incidents (
  id text primary key default (gen_random_uuid())::text,
  type text not null,            -- Accident / Breakdown / Flat Tire / Emergency / Other
  detail text not null,
  mission_id text,
  vehicle_plate text,
  reported_by text,
  source text default 'manual',  -- 'voice' | 'manual'
  created_date timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- org_settings — single row: brand theme + branding studio + fuel bands
-- ---------------------------------------------------------------------------
create table public.org_settings (
  id boolean primary key default true check (id),
  brand_primary text not null default '#1E7A5A',
  brand_accent text not null default '#F2B705',
  branding jsonb default '{}'::jsonb,   -- {name, logo, logoSize, font, size, background}
  fuel_bands jsonb default '{}'::jsonb, -- {gasoline:{min,max}, diesel:{min,max}}
  updated_at timestamptz not null default now()
);
insert into public.org_settings (id) values (true);

-- ---------------------------------------------------------------------------
-- Indexes for the dashboard / report queries
-- ---------------------------------------------------------------------------
create index on public.transport_requests (schedule_date desc);
create index on public.transport_requests (status);
create index on public.mileage_logs (time_out desc);
create index on public.fuel_logs (vehicle_plate, fill_date desc);
create index on public.service_logs (vehicle_plate, service_date desc);
create index on public.incidents (created_date desc);

-- ============================================================================
-- RLS
-- ============================================================================
alter table public.profiles enable row level security;
alter table public.drivers enable row level security;
alter table public.vehicles enable row level security;
alter table public.service_logs enable row level security;
alter table public.fuel_logs enable row level security;
alter table public.transport_requests enable row level security;
alter table public.mileage_logs enable row level security;
alter table public.incidents enable row level security;
alter table public.org_settings enable row level security;

create function public.current_role()
returns text
language sql stable security definer set search_path = public
as $$
  select role from public.profiles where id = auth.uid()::text;
$$;

create function public.current_status()
returns text
language sql stable security definer set search_path = public
as $$
  select status from public.profiles where id = auth.uid()::text;
$$;

create function public.is_manager()
returns boolean
language sql stable security definer set search_path = public
as $$
  select public.current_role() in ('Super Admin', 'Admin', 'Supervisor');
$$;

-- profiles: active users can see the team; only Super Admin/Admin change roles
create policy "profiles read" on public.profiles
  for select using (public.current_status() = 'Active' or id = auth.uid()::text);
create policy "profiles self insert" on public.profiles
  for insert with check (id = auth.uid()::text);
create policy "profiles admins update" on public.profiles
  for update using (public.current_role() in ('Super Admin', 'Admin'))
  with check (public.current_role() in ('Super Admin', 'Admin'));
create policy "profiles super admin delete" on public.profiles
  for delete using (public.current_role() = 'Super Admin');

-- day-to-day tables: any Active signed-in user operates the fleet
create policy "drivers active all" on public.drivers
  for all using (public.current_status() = 'Active') with check (public.current_status() = 'Active');
create policy "vehicles active all" on public.vehicles
  for all using (public.current_status() = 'Active') with check (public.current_status() = 'Active');
create policy "service_logs active all" on public.service_logs
  for all using (public.current_status() = 'Active') with check (public.current_status() = 'Active');
create policy "fuel_logs active all" on public.fuel_logs
  for all using (public.current_status() = 'Active') with check (public.current_status() = 'Active');
create policy "transport_requests active all" on public.transport_requests
  for all using (public.current_status() = 'Active') with check (public.current_status() = 'Active');
create policy "mileage_logs active all" on public.mileage_logs
  for all using (public.current_status() = 'Active') with check (public.current_status() = 'Active');
create policy "incidents active all" on public.incidents
  for all using (public.current_status() = 'Active') with check (public.current_status() = 'Active');

create policy "org_settings read" on public.org_settings
  for select using (public.current_status() = 'Active');
create policy "org_settings admins update" on public.org_settings
  for update using (public.current_role() in ('Super Admin', 'Admin'))
  with check (public.current_role() in ('Super Admin', 'Admin'));

-- ============================================================================
-- v2.1 — creator stamping (created_by) for demo-account wipe support
-- ============================================================================
alter table public.transport_requests add column if not exists created_by text;
alter table public.mileage_logs add column if not exists created_by text;
alter table public.fuel_logs add column if not exists created_by text;
alter table public.incidents add column if not exists created_by text;
alter table public.service_logs add column if not exists created_by text;
alter table public.drivers add column if not exists created_by text;
alter table public.vehicles add column if not exists created_by text;

-- ============================================================================
-- Storage — one public bucket for captured photos & branding logo
-- ============================================================================
insert into storage.buckets (id, name, public)
values ('fleetflow-media', 'fleetflow-media', true)
on conflict (id) do nothing;

create policy "fleetflow-media public read" on storage.objects
  for select using (bucket_id = 'fleetflow-media');
create policy "fleetflow-media active write" on storage.objects
  for insert with check (bucket_id = 'fleetflow-media' and public.current_status() = 'Active');
create policy "fleetflow-media active update" on storage.objects
  for update using (bucket_id = 'fleetflow-media' and public.current_status() = 'Active');

-- ============================================================================
-- Optional demo seed (uncomment to start with the demo fleet)
-- ============================================================================
-- insert into public.vehicles (id, plate_number, unit_name, model, fuel_type, tank_liters, rated_km_per_liter, status) values
--   ('demo-v1', 'NAC 1234', 'Van 01',  'Toyota Hiace Grandia', 'diesel',   60, 9,  'available'),
--   ('demo-v2', 'NAC 5678', 'Sedan 02','Toyota Vios 1.5 G',    'gasoline', 45, 11, 'available'),
--   ('demo-v3', 'NAC 9012', 'Van 03',  'Hyundai H-100',        'diesel',   60, 9,  'maintenance');
-- insert into public.drivers (id, full_name, employee_id, license_number, license_expiry, status) values
--   ('demo-d1', 'Edward Sacil',  'MS-00005', 'G11-10-000495', '2033-06-05', 'Active'),
--   ('demo-d2', 'Miguel Torres', 'MS-00011', 'G11-08-221104', date + interval '38 days', 'Active'),
--   ('demo-d3', 'Ana Dela Cruz', 'MS-00018', 'G11-05-337891', '2028-11-30', 'Active');
