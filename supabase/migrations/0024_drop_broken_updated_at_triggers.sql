-- 0024 — Drop update_updated_at() triggers on tables that have no
-- updated_at column to assign
-- ---------------------------------------------------------------------------
-- update_updated_at() (0003) is only ever attached to `organizations` in
-- any migration in this repo. Live, it's also attached to `vehicles` (and
-- possibly other tables) — undocumented drift, the same kind found during
-- the earlier security review (the "View org drivers/vehicles/fuel logs"
-- policies): almost certainly added via Supabase Studio's UI, which offers
-- a one-click "auto-update updated_at" trigger, without first checking the
-- table actually has that column. The result: ANY update to that table
-- fails outright with "record NEW has no field updated_at" — this is what
-- blocked 0023's data migration on vehicles.
--
-- Self-healing rather than a hardcoded table list: finds every trigger
-- using update_updated_at() whose table genuinely lacks an updated_at
-- column, and drops only those. `organizations` (which has the column and
-- is meant to have this trigger) is untouched.
-- ---------------------------------------------------------------------------

do $$
declare
  t record;
begin
  for t in
    select trg.tgname, cls.relname as table_name
    from pg_trigger trg
    join pg_proc proc on proc.oid = trg.tgfoid
    join pg_class cls on cls.oid = trg.tgrelid
    join pg_namespace ns on ns.oid = cls.relnamespace
    where proc.proname = 'update_updated_at'
      and ns.nspname = 'public'
      and not trg.tgisinternal
      and not exists (
        select 1 from information_schema.columns c
        where c.table_schema = 'public'
          and c.table_name = cls.relname
          and c.column_name = 'updated_at'
      )
  loop
    execute format('drop trigger %I on public.%I', t.tgname, t.table_name);
    raise notice 'Dropped broken trigger % on % (no updated_at column)', t.tgname, t.table_name;
  end loop;
end $$;

-- ---------------------------------------------------------------------------
-- VERIFY: this should now list ONLY organizations (or any table that
-- genuinely has an updated_at column):
--   select event_object_table, trigger_name from information_schema.triggers
--   where trigger_name ilike '%updated_at%' order by event_object_table;
-- Then re-run 0023's migrate SQL — it should get past vehicles cleanly.
-- ============================================================================
