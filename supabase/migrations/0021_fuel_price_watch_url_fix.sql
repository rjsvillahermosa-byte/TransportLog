-- 0021 — Fix run_fuel_price_watch_sweep(): ALTER DATABASE ... SET requires
-- superuser on Supabase's hosted platform, which the SQL Editor's `postgres`
-- role doesn't have ("permission denied to set parameter"), so 0020's
-- `current_setting('app.settings.supabase_url', true)` approach never had a
-- value to read. The project URL isn't actually sensitive — it's already
-- public in the site's own shipped JS bundle (it's how the browser talks to
-- Supabase directly) — so this hardcodes it in the function instead of
-- trying to make it a database-level setting that needs elevated privileges
-- to configure.

create or replace function public.run_fuel_price_watch_sweep()
returns void
language plpgsql
security definer
set search_path = public, extensions, vault
as $$
declare
  v_secret text;
  v_url    text := 'https://yhdvfjkfzrgcrzstnpti.supabase.co';
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
    perform net.http_post(
      url := v_url || '/functions/v1/fuel-price-watch',
      headers := jsonb_build_object('Content-Type', 'application/json', 'x-cron-secret', v_secret),
      body := jsonb_build_object('organization_id', o.organization_id),
      timeout_milliseconds := 20000
    );
  end loop;
end;
$$;

-- ---------------------------------------------------------------------------
-- VERIFY (SQL editor):
--   select public.run_fuel_price_watch_sweep();  -- should run with no error
--   select * from cron.job where jobname = 'fuel-price-watch-daily';
--   -- next run picks up this new function body automatically — no need to
--   -- re-schedule the cron job, only the function it calls changed.
-- ============================================================================
