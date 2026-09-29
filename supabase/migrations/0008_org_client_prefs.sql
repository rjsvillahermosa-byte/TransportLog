-- 0008 — Client preferences: booking locations, time standard, role terminology
-- ---------------------------------------------------------------------------
-- Adds three org-scoped preference sets the client UI reads:
--   location_presets jsonb  [{ name: "Mactan Airport", kind: "both"|"pickup"|"dropoff" }]
--   time_format      text   '24h' (standard) | '12h'
--   role_terms       jsonb  { "Admin": "Dispatcher", "Staff": "Front Office", ... }
--
-- ALSO unblocks per-org settings: 0001 created org_settings with a single-row
-- boolean PK (id boolean default true check (id)), so 0003's organization_id
-- column could never hold a second row. We convert id to uuid, add a unique
-- index on organization_id, and auto-provision a settings row per org.

-- 1) id: boolean single-row PK -> uuid (the one legacy row keeps existing).
-- Guarded so re-running is safe: only converts when the column is still the
-- legacy boolean. PK is dropped and rebuilt around the type change.
do $$
begin
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'org_settings'
      and column_name = 'id' and data_type = 'boolean'
  ) then
    alter table public.org_settings drop constraint if exists org_settings_id_check;
    alter table public.org_settings drop constraint if exists org_settings_pkey;
    alter table public.org_settings alter column id set default gen_random_uuid();
    alter table public.org_settings alter column id type uuid using gen_random_uuid();
    alter table public.org_settings add primary key (id);
  end if;
end $$;

-- 2) preference columns (defaults implement the "standard time = 24hrs" rule)
alter table public.org_settings
  add column if not exists location_presets jsonb not null default '[]'::jsonb,
  add column if not exists time_format      text  not null default '24h',
  add column if not exists role_terms       jsonb not null default '{}'::jsonb;

alter table public.org_settings
  drop constraint if exists org_settings_time_format_check;
alter table public.org_settings
  add constraint org_settings_time_format_check check (time_format in ('24h', '12h'));

-- one settings row per org (NULL org = legacy local-mode row, stays allowed)
create unique index if not exists org_settings_org_uidx
  on public.org_settings (organization_id);

-- 3) provision a settings row whenever a new org is created.
--    SECURITY DEFINER: org_settings RLS has no insert policy on purpose —
--    row provisioning is a platform concern, not a client action.
create or replace function public.ensure_org_settings_row()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.org_settings (organization_id)
  values (new.id)
  on conflict (organization_id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_org_created_ensure_settings on public.organizations;
create trigger on_org_created_ensure_settings
  after insert on public.organizations
  for each row execute function public.ensure_org_settings_row();

-- 4) backfill: every existing org gets its settings row
insert into public.org_settings (organization_id)
select o.id
from public.organizations o
where not exists (
  select 1 from public.org_settings s where s.organization_id = o.id
);

-- ---------------------------------------------------------------------------
-- VERIFY (run after applying):
--   select id, organization_id, time_format, location_presets, role_terms
--   from public.org_settings;
--   -> one row per org, plus the legacy NULL row; time_format = '24h'
-- ---------------------------------------------------------------------------
