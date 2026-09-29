-- 0020 — Per-organization fuel price watch: an admin-supplied URL, scraped on
-- a schedule (and on demand), auto-updates that org's own fuel bands.
-- ---------------------------------------------------------------------------
-- Why per-org, not one platform-wide price: FleetFlow is multi-tenant, and
-- clients aren't all in the Philippines — a Malaysia or Spain client's fuel
-- price and currency are completely different from a Philippine one. A
-- single global price was wrong the moment a second country's client signs
-- up. Each org sets its OWN source URL and gets its OWN currency + bands;
-- nothing here is shared across organizations.
--
-- org_settings.fuel_bands (jsonb) has existed since 0001 but the frontend
-- never actually read/wrote it — it used localStorage instead, per-device,
-- never synced, and stale. This migration adds the columns the price-watch
-- feature needs alongside it; a later app-side change (not this file)
-- rewires the frontend onto these columns instead of localStorage.
-- ---------------------------------------------------------------------------

alter table public.org_settings add column if not exists currency_code text not null default 'PHP';
alter table public.org_settings add column if not exists currency_symbol text not null default '₱';
alter table public.org_settings add column if not exists fuel_price_source_url text;
alter table public.org_settings add column if not exists fuel_price_last_checked_at timestamptz;
alter table public.org_settings add column if not exists fuel_price_last_status text;

comment on column public.org_settings.fuel_price_source_url is
  'Admin-supplied page the fuel-price-watch edge function reads for this org''s current fuel price. Never fetched client-side; SSRF-guarded server-side.';
comment on column public.org_settings.fuel_price_last_status is
  'Human-readable outcome of the most recent scrape attempt (success or error). fuel_bands is left unchanged on any failure — a bad scrape never corrupts live fraud-detection bands.';

-- ---------------------------------------------------------------------------
-- Scheduled sweep: once a day, call the edge function once per org that has
-- a source URL configured. Uses pg_cron + pg_net (both standard Supabase
-- extensions). The edge function authenticates this call via a shared
-- secret header, kept in Supabase Vault — never in this file, never in git.
-- ---------------------------------------------------------------------------

create extension if not exists pg_cron with schema extensions;
create extension if not exists pg_net with schema extensions;

-- ONE-TIME SETUP — replace the placeholder below with a real random value
-- BEFORE running this migration (e.g. generate one with `openssl rand -hex 32`
-- in any terminal). Use that SAME value when running:
--   supabase secrets set CRON_SECRET=<the same value> --project-ref <ref>
-- This value is the only thing standing between the public internet and
-- triggering a scrape sweep — treat it like a password, never commit it.
select vault.create_secret(
  'REPLACE-WITH-YOUR-OWN-RANDOM-SECRET',
  'fuel_price_watch_cron_secret',
  'Shared secret so pg_cron can call the fuel-price-watch edge function.'
) where not exists (
  select 1 from vault.secrets where name = 'fuel_price_watch_cron_secret'
);

create or replace function public.run_fuel_price_watch_sweep()
returns void
language plpgsql
security definer
set search_path = public, extensions, vault
as $$
declare
  v_secret text;
  v_url    text;
  o        record;
begin
  select decrypted_secret into v_secret
  from vault.decrypted_secrets where name = 'fuel_price_watch_cron_secret';

  if v_secret is null then
    raise notice 'fuel_price_watch_cron_secret not set — skipping sweep';
    return;
  end if;

  for o in
    select os.organization_id
    from public.org_settings os
    where os.fuel_price_source_url is not null
      and os.organization_id is not null
  loop
    v_url := current_setting('app.settings.supabase_url', true);
    if v_url is null or v_url = '' then
      -- Fallback: derive from any known project URL pattern is unreliable
      -- across environments, so this must be set once (see VERIFY below).
      raise notice 'app.settings.supabase_url not set — cannot sweep org %', o.organization_id;
      continue;
    end if;

    perform net.http_post(
      url := v_url || '/functions/v1/fuel-price-watch',
      headers := jsonb_build_object('Content-Type', 'application/json', 'x-cron-secret', v_secret),
      body := jsonb_build_object('organization_id', o.organization_id),
      timeout_milliseconds := 20000
    );
  end loop;
end;
$$;

select cron.schedule(
  'fuel-price-watch-daily',
  '17 2 * * *',  -- 02:17 UTC daily — off the hour, avoids piling up with other jobs
  $$select public.run_fuel_price_watch_sweep()$$
) where not exists (
  select 1 from cron.job where jobname = 'fuel-price-watch-daily'
);

-- ---------------------------------------------------------------------------
-- VERIFY (SQL editor, in order):
--   1) One-time: tell Postgres this project's own URL, so the sweep function
--      can reach it (replace with your actual project URL):
--        alter database postgres set app.settings.supabase_url =
--          'https://yhdvfjkfzrgcrzstnpti.supabase.co';
--      (Requires a new connection to take effect — the next cron run picks
--      it up automatically; to test sooner, reconnect in the SQL editor.)
--   2) select * from cron.job where jobname = 'fuel-price-watch-daily';
--      -- expect one row, active = true
--   3) After setting a real org's fuel_price_source_url (see the app-side
--      Settings card) and deploying the edge function:
--        select public.run_fuel_price_watch_sweep();
--        select client_code, fuel_price_last_checked_at, fuel_price_last_status,
--               currency_code, fuel_bands
--        from public.organizations o join public.org_settings os
--          on os.organization_id = o.id
--        where os.fuel_price_source_url is not null;
-- ============================================================================
