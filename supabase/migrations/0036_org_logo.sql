-- 0036 — Per-organization logo: white-label branding for each client
-- ---------------------------------------------------------------------------
-- Until now the only "branding" was the Super Admin's device-local Branding
-- Studio (localStorage, src/lib/branding.js) — not synced, not per-client,
-- invisible to anyone on a different browser/device. Real clients (e.g.
-- Madison Suites) need THEIR OWN logo shown to THEIR OWN users, everywhere:
-- the login page (before auth, so a client_code lookup is used — same model
-- as lookup_client_code already uses for the Register page) and the in-app
-- header once signed in (any member of that org can read their own org row
-- via the existing "orgs read own" policy, 0003/0014 — no RLS change needed
-- there).
-- ---------------------------------------------------------------------------

alter table public.organizations add column if not exists logo_url text;

comment on column public.organizations.logo_url is
  'Public URL (fleetflow-media bucket) of this org''s logo. Shown on the login page (via lookup_client_code) and in the in-app header for that org''s members. NULL = falls back to the default FleetFlow mark.';

-- lookup_client_code (0015) now also returns logo_url — still only 3+1 safe,
-- non-PII columns, so no change to its security posture.
create or replace function public.lookup_client_code(p_code text)
returns table (client_code text, name text, plan_status text, logo_url text)
language sql stable security definer set search_path = public
as $$
  select o.client_code, o.name, o.plan_status, o.logo_url
  from public.organizations o
  where o.client_code = upper(btrim(p_code))
    and o.plan_status = 'active'
  limit 1
$$;

grant execute on function public.lookup_client_code(text) to anon, authenticated;

-- ---------------------------------------------------------------------------
-- Storage: let the platform owner upload a logo into ANY org's folder from
-- the Clients page (onboarding a new client's branding on their behalf).
-- 0004 scoped fleetflow-media writes to the caller's OWN org only — add an
-- is_platform_super() OR-branch, mirroring the same escape hatch 0013 already
-- added to every ops table and to organizations itself.
-- ---------------------------------------------------------------------------

drop policy if exists "fleetflow-media org write" on storage.objects;
create policy "fleetflow-media org write" on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'fleetflow-media'
    and (
      (
        name ~ '^uploads/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/'
        and (
          (substring(name from '^uploads/([0-9a-f-]{36})/'))::uuid in (select public.get_my_org_ids())
          or public.is_platform_super()
        )
      )
      or (name ~ '^uploads/legacy/' and public.current_status() = 'Active')
    )
  );

drop policy if exists "fleetflow-media org update" on storage.objects;
create policy "fleetflow-media org update" on storage.objects
  for update to authenticated
  using (
    bucket_id = 'fleetflow-media'
    and (
      (
        name ~ '^uploads/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/'
        and (
          (substring(name from '^uploads/([0-9a-f-]{36})/'))::uuid in (select public.get_my_org_ids())
          or public.is_platform_super()
        )
      )
      or (name ~ '^uploads/legacy/' and public.current_status() = 'Active')
    )
  )
  with check (
    bucket_id = 'fleetflow-media'
    and (
      (
        name ~ '^uploads/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/'
        and (
          (substring(name from '^uploads/([0-9a-f-]{36})/'))::uuid in (select public.get_my_org_ids())
          or public.is_platform_super()
        )
      )
      or (name ~ '^uploads/legacy/' and public.current_status() = 'Active')
    )
  );

-- ---------------------------------------------------------------------------
-- VERIFY:
--   select * from public.lookup_client_code('MAD-001');
--   -- expect logo_url populated once the app-side upload has run
--   select policyname from pg_policies
--   where tablename = 'objects' and policyname like 'fleetflow-media org%';
--   -- expect 2 rows (write, update)
-- ---------------------------------------------------------------------------
