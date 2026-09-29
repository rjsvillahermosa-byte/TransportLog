-- 0026 — Move the one remaining TLF-001-tagged vehicle to Madison Suites
-- ---------------------------------------------------------------------------
-- 0023's original run hit 0024's broken trigger on its very first UPDATE
-- (vehicles), and since the whole migration is one atomic do-block, that
-- rolled the entire thing back -- nothing from 0023 actually committed.
-- 0024 (trigger fix) and 0025 (NULL-org backfill) both ran fine
-- afterward, but 0023 itself was never re-run, leaving this one
-- already-tagged-TLF-001 vehicle stuck. Finishes that specific move.
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

  update public.vehicles set organization_id = v_to where organization_id = v_from;
  get diagnostics n = row_count; raise notice 'vehicles: % rows moved', n;
end $$;

-- ---------------------------------------------------------------------------
-- VERIFY: TLF-001's vehicle count should now be 0, Madison Suites' should
-- have gone up by 1.
-- ============================================================================
