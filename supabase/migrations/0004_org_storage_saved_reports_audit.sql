-- ============================================================================
-- Migration: 0004_org_storage_saved_reports_audit.sql
-- FleetFlow SaaS — completes tenancy coverage after 0003:
--
--   1) STORAGE — per-org object scoping in the fleetflow-media bucket.
--      0001 let ANY Active user write ANY path. Uploads are now namespaced
--      uploads/<org-uuid>/<file> and the insert policy verifies the caller
--      is an active member of the org in the path. Public read stays (the
--      app renders <img> from getPublicUrl; tightening to signed URLs is a
--      later hardening step and would need a db.js change).
--
--   2) SAVED_REPORTS — per-org saved report definitions (title + params
--      JSON), so Reports/Settings can persist a configured report instead
--      of re-entering filters. RLS identical to the ops tables.
--
--   3) TENANCY AUDIT — fails loudly (rolls the migration back) if any ops
--      table is missing organization_id, RLS, or an org-scoped policy.
--      locations is a WARN only: its org column arrives with the native
--      repo's 0002, which may run after this file.
--
-- Requirements: 0003_saas_tenancy.sql (organizations, get_my_org_ids,
-- assert_org_access). Run 0002_create_locations.sql when convenient —
-- this file does not depend on it.
-- Re-runnable: every statement is guarded (if exists / or replace).
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1) STORAGE — org-scoped uploads (fleetflow-media)
--    Client side (src/lib/db.js UploadFile) writes uploads/<org-id>/<file>
--    after resolving the caller's org via get_my_org_ids(), falling back to
--    uploads/legacy/<file> when no membership exists (pre-backfill window).
-- ---------------------------------------------------------------------------

-- The 0001 write policies were global-to-active-users; replace, don't stack.
drop policy if exists "fleetflow-media active write" on storage.objects;
drop policy if exists "fleetflow-media active update" on storage.objects;

-- Read: unchanged — the bucket is public and the UI renders getPublicUrl().
-- (Audit hardening later: switch to createSignedUrl + private bucket.)
drop policy if exists "fleetflow-media public read" on storage.objects;
create policy "fleetflow-media public read" on storage.objects
  for select using (bucket_id = 'fleetflow-media');

-- Insert: path must carry the caller's own org id, or live under the
-- legacy/ escape hatch (active profile, no membership yet).
-- Regex is the canonical uuid shape so the ::uuid cast can never throw on
-- a hand-crafted 36-char path (it fails the check cleanly instead).
drop policy if exists "fleetflow-media org write" on storage.objects;
create policy "fleetflow-media org write" on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'fleetflow-media'
    and (
      (
        name ~ '^uploads/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/'
        and (substring(name from '^uploads/([0-9a-f-]{36})/'))::uuid
              in (select public.get_my_org_ids())
      )
      or (name ~ '^uploads/legacy/' and public.current_status() = 'Active')
    )
  );

-- Update: same scope as insert (client SDK upserts can rewrite their own
-- org's objects). Delete: intentionally NO policy — photos are audit
-- evidence (odo/receipt/fraud); removal stays service-role only.
drop policy if exists "fleetflow-media org update" on storage.objects;
create policy "fleetflow-media org update" on storage.objects
  for update to authenticated
  using (
    bucket_id = 'fleetflow-media'
    and (
      (
        name ~ '^uploads/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/'
        and (substring(name from '^uploads/([0-9a-f-]{36})/'))::uuid
              in (select public.get_my_org_ids())
      )
      or (name ~ '^uploads/legacy/' and public.current_status() = 'Active')
    )
  )
  with check (
    bucket_id = 'fleetflow-media'
    and (
      (
        name ~ '^uploads/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/'
        and (substring(name from '^uploads/([0-9a-f-]{36})/'))::uuid
              in (select public.get_my_org_ids())
      )
      or (name ~ '^uploads/legacy/' and public.current_status() = 'Active')
    )
  );

-- ---------------------------------------------------------------------------
-- 2) SAVED_REPORTS — reusable report definitions, one per org
--    (title + report_type + params mirror the Reports page's filter state;
--    params stays schema-free so new report kinds need no migration).
-- ---------------------------------------------------------------------------
create table if not exists public.saved_reports (
  id              text primary key default (gen_random_uuid())::text,
  organization_id uuid not null references public.organizations (id) on delete cascade,
  title           text not null,
  report_type     text not null,            -- 'fuel' | 'mileage' | 'missions' | 'savings' | custom
  params          jsonb not null default '{}'::jsonb,
  created_by      text,                     -- profiles.id (auth uid as text)
  created_date    timestamptz not null default now()
);

create index if not exists saved_reports_org_idx
  on public.saved_reports (organization_id, created_date desc);

alter table public.saved_reports enable row level security;

-- Same model as the ops tables: row's org must be one of my active orgs.
drop policy if exists "saved_reports_org_scoped" on public.saved_reports;
create policy "saved_reports_org_scoped" on public.saved_reports
  for all
  using (public.assert_org_access(organization_id))
  with check (public.assert_org_access(organization_id));

grant select, insert, update, delete on public.saved_reports to authenticated;

-- ---------------------------------------------------------------------------
-- 3) TENANCY AUDIT — hard gates roll this migration back on failure
--    (better an error in the SQL editor than silently half-scoped RLS).
-- ---------------------------------------------------------------------------

do $audit$
declare
  t       text;
  v_fail  integer := 0;
begin
  -- 3a) every tenanted table: org column present, RLS on, org-scoped policy
  foreach t in array array[
    'vehicles','drivers','service_logs','fuel_logs',
    'transport_requests','mileage_logs','incidents',
    'org_settings','saved_reports'
  ]
  loop
    if not exists (
      select 1 from information_schema.columns
       where table_schema = 'public' and table_name = t
         and column_name = 'organization_id'
    ) then
      raise notice '0004 audit FAIL: %.organization_id is missing', t;
      v_fail := v_fail + 1;
    end if;

    if not exists (
      select 1 from pg_class c
        join pg_namespace n on n.oid = c.relnamespace
       where n.nspname = 'public' and c.relname = t and c.relrowsecurity
    ) then
      raise notice '0004 audit FAIL: % does not have RLS enabled', t;
      v_fail := v_fail + 1;
    end if;

    if not exists (
      select 1 from pg_policies
       where schemaname = 'public' and tablename = t
         and (position('assert_org_access' in coalesce(qual, '') || coalesce(with_check, '')) > 0
           or position('get_my_org_ids'   in coalesce(qual, '') || coalesce(with_check, '')) > 0)
    ) then
      raise notice '0004 audit FAIL: % has no org-scoped policy', t;
      v_fail := v_fail + 1;
    end if;
  end loop;

  -- 3b) registry + profiles: RLS must be on (org scoping lives in 0003/0001)
  foreach t in array array['organizations', 'organization_members', 'profiles']
  loop
    if not exists (
      select 1 from pg_class c
        join pg_namespace n on n.oid = c.relnamespace
       where n.nspname = 'public' and c.relname = t and c.relrowsecurity
    ) then
      raise notice '0004 audit FAIL: % does not have RLS enabled', t;
      v_fail := v_fail + 1;
    end if;
  end loop;

  -- 3c) storage: bucket exists + the org write policy is actually installed
  if not exists (select 1 from storage.buckets where id = 'fleetflow-media') then
    raise notice '0004 audit FAIL: fleetflow-media bucket is missing';
    v_fail := v_fail + 1;
  end if;
  if not exists (
    select 1 from pg_policies
     where schemaname = 'storage' and tablename = 'objects'
       and policyname = 'fleetflow-media org write'
  ) then
    raise notice '0004 audit FAIL: fleetflow-media org write policy missing';
    v_fail := v_fail + 1;
  end if;

  -- 3d) locations: WARN only — its org column comes from 0002 (native repo),
  --     which may legitimately run after this file.
  if not exists (
    select 1 from information_schema.columns
     where table_schema = 'public' and table_name = 'locations'
       and column_name = 'organization_id'
  ) then
    raise notice '0004 audit WARN: locations.organization_id missing — run 0002_create_locations.sql';
  end if;

  if v_fail > 0 then
    raise exception '0004 audit FAILED with % problem(s) — migration rolled back. Fix the FAIL notices above and re-run.', v_fail;
  end if;

  raise notice '0004 audit: PASS — all tenanted tables carry organization_id + RLS + org-scoped policies.';
end
$audit$;

-- ============================================================================
-- APPLY NOTES
--   • Run AFTER 0003_saas_tenancy.sql (needs organizations, get_my_org_ids,
--     assert_org_access). No backfill needed — saved_reports starts empty.
--   • Re-run safe: all statements are guarded; the audit re-validates.
--   • Companion client change (same repo): src/lib/db.js UploadFile now
--     writes uploads/<org-id>/<file> (falls back to uploads/legacy/ when no
--     membership resolves), and the SavedReport entity is registered so
--     pages can call api.entities.SavedReport.* on both backends.
--   • Verify:
--       select * from pg_policies where tablename = 'saved_reports';
--       select * from pg_policies where schemaname = 'storage' and tablename = 'objects';
-- ============================================================================
