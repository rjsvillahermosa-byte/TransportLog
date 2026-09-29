-- 0023 — Move all operational data from TLF-001 to Madison Suites (MAD-001)
-- ---------------------------------------------------------------------------
-- TLF-001 was the original working/demo org from before multi-tenancy
-- existed; Madison Suites is the real first client. This reassigns every
-- operational row's organization_id to Madison Suites, so TLF-001 ends up
-- empty but still exists (its organizations row, org_settings row, and
-- organization_members rows are untouched — you stay a member of both).
--
-- org_settings is NOT reassigned like the other tables — 0008 gave it a
-- unique index on organization_id, and Madison Suites already has its own
-- settings row (auto-created when you created the org). Instead, this
-- copies TLF-001's actual values (branding, fuel bands, price-watch
-- source, currency, location presets, role terms) ONTO Madison Suites'
-- existing row. TLF-001's own settings row is left exactly as it is.
--
-- Everything below is ONE do-block, which Postgres already runs as a single
-- atomic statement — if anything inside raises, the whole thing rolls back
-- on its own. Never a half-migrated state.
-- ---------------------------------------------------------------------------

do $$
declare
  v_from uuid;
  v_to   uuid;
  n      integer;
begin
  select id into v_from from public.organizations where upper(client_code) = 'TLF-001';
  select id into v_to   from public.organizations where upper(client_code) = 'MAD-001';

  if v_from is null then raise exception 'TLF-001 not found'; end if;
  if v_to is null then raise exception 'MAD-001 not found'; end if;
  if v_from = v_to then raise exception 'TLF-001 and MAD-001 resolved to the same org — aborting'; end if;

  -- Operational tables: plain organization_id column, many rows per org,
  -- no uniqueness constraint to worry about.
  update public.vehicles           set organization_id = v_to where organization_id = v_from;
  get diagnostics n = row_count; raise notice 'vehicles: % rows moved', n;

  update public.drivers            set organization_id = v_to where organization_id = v_from;
  get diagnostics n = row_count; raise notice 'drivers: % rows moved', n;

  update public.service_logs       set organization_id = v_to where organization_id = v_from;
  get diagnostics n = row_count; raise notice 'service_logs: % rows moved', n;

  update public.fuel_logs          set organization_id = v_to where organization_id = v_from;
  get diagnostics n = row_count; raise notice 'fuel_logs: % rows moved', n;

  update public.transport_requests set organization_id = v_to where organization_id = v_from;
  get diagnostics n = row_count; raise notice 'transport_requests: % rows moved', n;

  update public.mileage_logs       set organization_id = v_to where organization_id = v_from;
  get diagnostics n = row_count; raise notice 'mileage_logs: % rows moved', n;

  update public.incidents          set organization_id = v_to where organization_id = v_from;
  get diagnostics n = row_count; raise notice 'incidents: % rows moved', n;

  update public.odometer_audit     set organization_id = v_to where organization_id = v_from;
  get diagnostics n = row_count; raise notice 'odometer_audit: % rows moved', n;

  update public.saved_reports      set organization_id = v_to where organization_id = v_from;
  get diagnostics n = row_count; raise notice 'saved_reports: % rows moved', n;

  update public.api_keys           set organization_id = v_to where organization_id = v_from;
  get diagnostics n = row_count; raise notice 'api_keys: % rows moved', n;

  -- org_settings: copy values across instead of reassigning (unique index
  -- on organization_id means Madison Suites' own row must stay its own row).
  update public.org_settings dst
     set brand_primary             = src.brand_primary,
         brand_accent              = src.brand_accent,
         branding                  = src.branding,
         fuel_bands                = src.fuel_bands,
         location_presets          = src.location_presets,
         time_format               = src.time_format,
         role_terms                = src.role_terms,
         currency_code             = src.currency_code,
         currency_symbol           = src.currency_symbol,
         fuel_price_source_url     = src.fuel_price_source_url,
         fuel_price_region         = src.fuel_price_region,
         fuel_price_last_checked_at = src.fuel_price_last_checked_at,
         fuel_price_last_status    = src.fuel_price_last_status,
         updated_at                = now()
    from public.org_settings src
   where src.organization_id = v_from
     and dst.organization_id = v_to;
  get diagnostics n = row_count; raise notice 'org_settings: % row updated (should be 1)', n;

  -- Organizations and organization_members are deliberately untouched —
  -- TLF-001 stays intact, and membership isn't part of this move.
end $$;

-- ---------------------------------------------------------------------------
-- VERIFY (SQL editor):
--   select o.client_code, count(v.*) as vehicles
--   from public.organizations o
--   left join public.vehicles v on v.organization_id = o.id
--   where o.client_code in ('TLF-001','MAD-001')
--   group by o.client_code;
--   -- repeat the pattern for drivers / transport_requests / fuel_logs / etc.
--   -- if you want the full picture. TLF-001 should show 0 everywhere;
--   -- Madison Suites should show what TLF-001 used to have.
-- ============================================================================
