-- FleetFlow initial schema
-- Mirrors the localStorage entity model in src/lib/db.js, adapted for Postgres + RLS.
-- Auth: uses Supabase Auth (auth.users) instead of the mock's plaintext-password users table.

-- ---------------------------------------------------------------------------
-- profiles — one row per auth.users, carries app-level role/status
-- ---------------------------------------------------------------------------
create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  full_name text not null,
  email text not null unique,
  role text not null default 'Staff' check (role in ('Admin', 'Staff')),
  status text not null default 'Active' check (status in ('Active', 'Disabled')),
  created_at timestamptz not null default now()
);

-- New signups (Register page) always land as Staff; first-ever user becomes Admin.
create function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  insert into public.profiles (id, full_name, email, role)
  values (
    new.id,
    coalesce(new.raw_user_meta_data ->> 'full_name', split_part(new.email, '@', 1)),
    new.email,
    case when (select count(*) from public.profiles) = 0 then 'Admin' else 'Staff' end
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
  id uuid primary key default gen_random_uuid(),
  full_name text not null,
  employee_id text,
  contact_number text,
  email text,
  license_number text,
  license_expiry date,
  license_photo_url text,
  avatar_url text,
  assigned_vehicle_plate text,
  status text not null default 'Active' check (status in ('Active', 'Inactive')),
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- vehicles
-- ---------------------------------------------------------------------------
create table public.vehicles (
  id uuid primary key default gen_random_uuid(),
  plate_number text not null unique,
  unit_name text,
  model text,
  status text not null default 'available' check (status in ('available', 'in_use', 'maintenance')),
  image_url text,
  fuel_type text check (fuel_type in ('diesel', 'gasoline')),
  tank_liters numeric,
  rated_km_per_liter numeric,
  pms_interval_km integer default 10000,
  pms_interval_months integer default 6,
  registration_expiry date,
  insurance_expiry date,
  registration_photo_url text,
  insurance_photo_url text,
  tire_life_km integer default 40000,
  tire_changed_odometer integer default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- service_logs — PMS / repairs / tire replacement / registration renewal
-- ---------------------------------------------------------------------------
create table public.service_logs (
  id uuid primary key default gen_random_uuid(),
  vehicle_id uuid not null references public.vehicles (id) on delete cascade,
  service_type text not null,
  service_date date not null,
  odometer_at_service integer,
  next_service_km integer,
  next_service_date date,
  service_provider text,
  cost numeric,
  notes text,
  source text default 'manual' check (source in ('manual', 'ocr')),
  report_photo_url text,
  created_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- fuel_logs
-- ---------------------------------------------------------------------------
create table public.fuel_logs (
  id uuid primary key default gen_random_uuid(),
  vehicle_id uuid not null references public.vehicles (id) on delete cascade,
  fill_date date not null,
  odometer integer not null,
  liters numeric not null,
  cost numeric not null,
  full_tank boolean default true,
  station text,
  receipt_photo_url text,
  encoded_by text,
  created_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- transport_requests — guest bookings + department errands ("missions")
-- ---------------------------------------------------------------------------
create table public.transport_requests (
  id uuid primary key default gen_random_uuid(),
  mission_id text not null unique default lpad(floor(random() * 900000 + 100000)::text, 6, '0'),
  guest_name text not null,
  requester_type text not null default 'Guest' check (requester_type in ('Guest', 'Errand')),
  requested_by text,
  pax_count integer default 1,
  booking_type text not null,
  pickup_location text not null,
  destination text not null,
  schedule_date date not null,
  schedule_time time not null,
  assigned_driver_id uuid references public.drivers (id),
  vehicle_id uuid references public.vehicles (id),
  department text,
  special_notes text,
  status text not null default 'Pending' check (status in ('Pending', 'Assigned', 'Ongoing', 'Completed', 'Cancelled')),
  created_by uuid references public.profiles (id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- mileage_logs — one per completed mission leg (odometer capture)
-- ---------------------------------------------------------------------------
create table public.mileage_logs (
  id uuid primary key default gen_random_uuid(),
  request_id uuid not null references public.transport_requests (id) on delete cascade,
  driver_id uuid references public.drivers (id),
  vehicle_id uuid references public.vehicles (id),
  time_out timestamptz,
  time_in timestamptz,
  start_odometer integer,
  end_odometer integer,
  odo_start_photo_url text,
  odo_end_photo_url text,
  distance integer generated always as (end_odometer - start_odometer) stored,
  remarks text,
  status text not null default 'Ongoing' check (status in ('Ongoing', 'Completed')),
  route_coordinates jsonb,
  created_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- org_settings — single-row brand theme (Settings → Brand Theme)
-- ---------------------------------------------------------------------------
create table public.org_settings (
  id boolean primary key default true check (id),
  brand_primary text not null default '#1E7A5A',
  brand_accent text not null default '#F2B705',
  updated_at timestamptz not null default now()
);
insert into public.org_settings (id) values (true);

-- ---------------------------------------------------------------------------
-- RLS — all tables locked to authenticated users; profile/theme admin-gated
-- ---------------------------------------------------------------------------
alter table public.profiles enable row level security;
alter table public.drivers enable row level security;
alter table public.vehicles enable row level security;
alter table public.service_logs enable row level security;
alter table public.fuel_logs enable row level security;
alter table public.transport_requests enable row level security;
alter table public.mileage_logs enable row level security;
alter table public.org_settings enable row level security;

create function public.current_role()
returns text
language sql stable security definer set search_path = public
as $$
  select role from public.profiles where id = auth.uid();
$$;

create function public.current_status()
returns text
language sql stable security definer set search_path = public
as $$
  select status from public.profiles where id = auth.uid();
$$;

-- Any active signed-in user (Admin or Staff) can operate the fleet day-to-day.
create policy "active users read profiles" on public.profiles
  for select using (public.current_status() = 'Active');
create policy "admins manage profiles" on public.profiles
  for update using (public.current_role() = 'Admin')
  with check (public.current_role() = 'Admin');
create policy "users read own profile always" on public.profiles
  for select using (id = auth.uid());

create policy "active users full access drivers" on public.drivers
  for all using (public.current_status() = 'Active') with check (public.current_status() = 'Active');
create policy "active users full access vehicles" on public.vehicles
  for all using (public.current_status() = 'Active') with check (public.current_status() = 'Active');
create policy "active users full access service_logs" on public.service_logs
  for all using (public.current_status() = 'Active') with check (public.current_status() = 'Active');
create policy "active users full access fuel_logs" on public.fuel_logs
  for all using (public.current_status() = 'Active') with check (public.current_status() = 'Active');
create policy "active users full access transport_requests" on public.transport_requests
  for all using (public.current_status() = 'Active') with check (public.current_status() = 'Active');
create policy "active users full access mileage_logs" on public.mileage_logs
  for all using (public.current_status() = 'Active') with check (public.current_status() = 'Active');

create policy "active users read org_settings" on public.org_settings
  for select using (public.current_status() = 'Active');
create policy "admins update org_settings" on public.org_settings
  for update using (public.current_role() = 'Admin') with check (public.current_role() = 'Admin');

-- ---------------------------------------------------------------------------
-- Storage — one bucket for all captured photos (license/OR-CR/insurance/
-- casa-report/odometer/receipts/avatars), folder-prefixed by kind.
-- ---------------------------------------------------------------------------
insert into storage.buckets (id, name, public) values ('fleetflow-media', 'fleetflow-media', true);

create policy "active users read fleetflow-media" on storage.objects
  for select using (bucket_id = 'fleetflow-media' and public.current_status() = 'Active');
create policy "active users upload fleetflow-media" on storage.objects
  for insert with check (bucket_id = 'fleetflow-media' and public.current_status() = 'Active');
create policy "active users update fleetflow-media" on storage.objects
  for update using (bucket_id = 'fleetflow-media' and public.current_status() = 'Active');
