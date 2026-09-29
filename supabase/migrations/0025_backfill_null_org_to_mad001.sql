-- 0025 — Backfill NULL-organization_id rows onto Madison Suites (MAD-001)
-- ---------------------------------------------------------------------------
-- 0003's own migration comments describe a manual "STEP 3" backfill meant
-- to label every pre-tenancy row as TLF-001's — it was apparently never
-- actually run. The result: this platform's real historical data (trips,
-- the one vehicle, etc.) has organization_id = NULL, not TLF-001. It was
-- only ever visible to the platform owner via the NULL-org override built
-- into 0011/0013 for exactly this recovery scenario — invisible to every
-- other account, including anyone added to Madison Suites.
--
-- Since the actual goal (0023) was moving everything to Madison Suites
-- anyway, this labels the NULL rows as Madison Suites' directly rather
-- than staging them through TLF-001 first. Same table list as 0023, same
-- single-do-block atomicity.
-- ---------------------------------------------------------------------------

do $$
declare
  v_to uuid;
  n    integer;
begin
  select id into v_to from public.organizations where upper(client_code) = 'MAD-001';
  if v_to is null then raise exception 'MAD-001 not found'; end if;

  update public.vehicles           set organization_id = v_to where organization_id is null;
  get diagnostics n = row_count; raise notice 'vehicles: % rows backfilled', n;

  update public.drivers            set organization_id = v_to where organization_id is null;
  get diagnostics n = row_count; raise notice 'drivers: % rows backfilled', n;

  update public.service_logs       set organization_id = v_to where organization_id is null;
  get diagnostics n = row_count; raise notice 'service_logs: % rows backfilled', n;

  update public.fuel_logs          set organization_id = v_to where organization_id is null;
  get diagnostics n = row_count; raise notice 'fuel_logs: % rows backfilled', n;

  update public.transport_requests set organization_id = v_to where organization_id is null;
  get diagnostics n = row_count; raise notice 'transport_requests: % rows backfilled', n;

  update public.mileage_logs       set organization_id = v_to where organization_id is null;
  get diagnostics n = row_count; raise notice 'mileage_logs: % rows backfilled', n;

  update public.incidents          set organization_id = v_to where organization_id is null;
  get diagnostics n = row_count; raise notice 'incidents: % rows backfilled', n;

  update public.odometer_audit     set organization_id = v_to where organization_id is null;
  get diagnostics n = row_count; raise notice 'odometer_audit: % rows backfilled', n;

  update public.saved_reports      set organization_id = v_to where organization_id is null;
  get diagnostics n = row_count; raise notice 'saved_reports: % rows backfilled', n;

  update public.api_keys           set organization_id = v_to where organization_id is null;
  get diagnostics n = row_count; raise notice 'api_keys: % rows backfilled', n;
end $$;

-- ---------------------------------------------------------------------------
-- VERIFY: re-run 0023's verification query. Madison Suites should now show
-- the real historical counts (9 missions per the app's History page, etc.);
-- TLF-001 stays at zero (its one vehicle already moved there by 0023).
-- ============================================================================
