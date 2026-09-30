-- 0029 — Roadmap features: Subscriptions, Master Permissions, R&D Lab
-- ---------------------------------------------------------------------------
-- 1) SUBSCRIPTIONS (manual invoicing — no payment gateway yet):
--    billing columns on organizations + invoices table. The platform owner
--    records invoices and marks them paid; upgrade flow = plan change here.
-- 2) MASTER PERMISSIONS: role_permissions matrix. The DB keeps enforcing its
--    RLS floor; this tunes UI access (nav/routes) per role within that floor.
-- 3) R&D LAB: feature_flags with per-org rollout — gates real features.
-- Idempotent. Run in the SQL editor.
-- ---------------------------------------------------------------------------

-- 1) Subscriptions -----------------------------------------------------------
alter table public.organizations
  add column if not exists billing_cycle  text not null default 'monthly'
    check (billing_cycle in ('monthly','quarterly','annual')),
  add column if not exists monthly_price  numeric(10,2),
  add column if not exists renewal_date   date;

create table if not exists public.subscriptions_invoices (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  amount          numeric(10,2) not null,
  currency        text not null default 'PHP',
  period_start    date,
  period_end      date,
  status          text not null default 'unpaid' check (status in ('unpaid','paid','void')),
  notes           text,
  created_by      text,
  issued_date     date not null default current_date,
  paid_date       date,
  created_at      timestamptz not null default now()
);
create index if not exists subs_inv_org_idx on public.subscriptions_invoices (organization_id, issued_date desc);

alter table public.subscriptions_invoices enable row level security;
drop policy if exists "invoices read" on public.subscriptions_invoices;
create policy "invoices read" on public.subscriptions_invoices
  for select using (
    public.is_platform_admin()
    or public.get_my_org_role(organization_id) is not null
  );
drop policy if exists "invoices admin write" on public.subscriptions_invoices;
create policy "invoices admin write" on public.subscriptions_invoices
  for all using (public.can_platform_write())
  with check (public.can_platform_write());

-- 2) Master permissions ------------------------------------------------------
create table if not exists public.role_permissions (
  id         uuid primary key default gen_random_uuid(),
  role       text not null check (role in ('Super Admin','Admin','Supervisor','Driver','Staff')),
  capability text not null,
  allowed    boolean not null default true,
  updated_at timestamptz not null default now(),
  unique (role, capability)
);

insert into public.role_permissions (role, capability, allowed) values
  ('Super Admin','view_reports',    true),
  ('Admin',     'view_reports',    true),
  ('Supervisor','view_reports',    true),
  ('Driver',    'view_reports',    false),
  ('Staff',     'view_reports',    false),
  ('Super Admin','manage_settings', true),
  ('Admin',     'manage_settings', true),
  ('Supervisor','manage_settings', false),
  ('Driver',    'manage_settings', false),
  ('Staff',     'manage_settings', false),
  ('Super Admin','manage_fleet',   true),
  ('Admin',     'manage_fleet',    true),
  ('Supervisor','manage_fleet',    true),
  ('Driver',    'manage_fleet',    false),
  ('Staff',     'manage_fleet',    false),
  ('Super Admin','manage_users',   true),
  ('Admin',     'manage_users',    true),
  ('Supervisor','manage_users',    false),
  ('Driver',    'manage_users',    false),
  ('Staff',     'manage_users',    false)
on conflict (role, capability) do nothing;

alter table public.role_permissions enable row level security;
-- No PII — every signed-in user's client needs the matrix for their role.
drop policy if exists "role_permissions read" on public.role_permissions;
create policy "role_permissions read" on public.role_permissions
  for select using (auth.role() = 'authenticated');
drop policy if exists "role_permissions admin write" on public.role_permissions;
create policy "role_permissions admin write" on public.role_permissions
  for all using (public.can_platform_write())
  with check (public.can_platform_write());

-- 3) R&D Lab -----------------------------------------------------------------
create table if not exists public.feature_flags (
  key          text primary key,
  label        text not null,
  description  text,
  enabled      boolean not null default false,
  enabled_orgs uuid[] not null default '{}',
  updated_at   timestamptz not null default now()
);

insert into public.feature_flags (key, label, description, enabled) values
  ('booking_presets','Booking location presets',
   'New Booking shows the org''s preset pickup/destination dropdowns (with Others). Off = free-text inputs for everyone.',true),
  ('fuel_price_watch','Fuel price watch',
   'Fetches public pump prices to contextualize fuel costs. Off = manual prices only.',false),
  ('ocr_odo_scan','AI odometer photo scan',
   'Drivers can scan the dashboard to prefill odometer readings. Off = manual entry only.',true)
on conflict (key) do nothing;

alter table public.feature_flags enable row level security;
drop policy if exists "feature_flags read" on public.feature_flags;
create policy "feature_flags read" on public.feature_flags
  for select using (auth.role() = 'authenticated');
drop policy if exists "feature_flags admin write" on public.feature_flags;
create policy "feature_flags admin write" on public.feature_flags
  for all using (public.can_platform_write())
  with check (public.can_platform_write());

-- ---------------------------------------------------------------------------
-- VERIFY:
--   select role, capability, allowed from role_permissions order by role;
--   select key, enabled from feature_flags;
--   select client_code, billing_cycle, monthly_price, renewal_date from organizations;
-- ---------------------------------------------------------------------------
