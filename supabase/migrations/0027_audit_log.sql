-- 0027 — Immutable audit log: "who changed what, across every tenant"
-- ---------------------------------------------------------------------------
-- Generic, trigger-fed audit trail for the security-sensitive entities.
-- * Row-level events on: transport_requests, vehicles, drivers, fuel_logs,
--   organization_members, api_keys, organizations, profiles.
-- * UPDATE rows store ONLY the changed columns as old→new pairs (long values
--   like data-URL images are stubbed, churn columns skipped).
-- * INSERT/DELETE rows store the actor + a human label (no full row dumps).
-- * RLS: platform team reads all; an org's Admin/Super/Supervisor reads its
--   own org's trail; Staff/Driver read none (details can carry staff names).
-- * NO insert/update/delete policies — like odometer_audit, rows can only
--   appear via the SECURITY DEFINER trigger, so the trail can't be doctored
--   through the API.
-- Idempotent. Run in the SQL editor.
-- ---------------------------------------------------------------------------

create table if not exists public.audit_log (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid,                       -- null = platform-global event
  actor_id        text,
  actor_email     text,
  actor_role      text,
  action          text not null,              -- created | updated | deleted
  entity_type     text not null,              -- source table name
  entity_id       text,
  entity_label    text,                       -- human-readable identifier
  details         jsonb,                      -- changed columns (updates)
  created_at      timestamptz not null default now()
);

create index if not exists audit_log_org_time_idx
  on public.audit_log (organization_id, created_at desc);
create index if not exists audit_log_entity_idx
  on public.audit_log (entity_type, entity_id);

alter table public.audit_log enable row level security;

drop policy if exists "audit_log read" on public.audit_log;
create policy "audit_log read" on public.audit_log
  for select using (
    public.is_platform_admin()
    or (
      organization_id is not null
      and public.get_my_org_role(organization_id) in ('Super Admin','Admin','Supervisor')
    )
  );

-- The writer -----------------------------------------------------------------
create or replace function public.audit_row_change()
returns trigger
language plpgsql security definer set search_path = public
as $$
declare
  v_new       jsonb;
  v_org       uuid;
  v_label     text;
  v_details   jsonb;
  v_email     text;
  v_role      text;
  k           text;
  v_val       jsonb;
begin
  v_new := case when tg_op = 'DELETE' then to_jsonb(old) else to_jsonb(new) end;

  v_org := (v_new ->> 'organization_id')::uuid;
  if tg_table_name = 'organizations' then
    v_org := (v_new ->> 'id')::uuid;
  end if;

  if auth.uid() is null then
    v_email := 'system'; v_role := 'system';
  else
    select email into v_email from auth.users where id = auth.uid();
    select role  into v_role  from public.profiles where id = auth.uid()::text;
  end if;

  v_label := coalesce(
    v_new ->> 'guest_name', v_new ->> 'plate_number', v_new ->> 'full_name',
    v_new ->> 'name', v_new ->> 'email', v_new ->> 'mission_id', v_new ->> 'id'
  );

  if tg_op = 'UPDATE' then
    v_details := '{}'::jsonb;
    for k in select jsonb_object_keys(to_jsonb(new)) loop
      v_val := to_jsonb(new) -> k;
      if v_val is distinct from (to_jsonb(old) -> k)
         and k not in ('updated_at', 'created_date', 'joined_at', 'last_used_at') then
        if jsonb_typeof(v_val) = 'string' and length(v_val #>> '{}') > 200 then
          v_details := jsonb_set(v_details, array[k], to_jsonb('[long value omitted]'));
        else
          v_details := jsonb_set(
            v_details, array[k],
            jsonb_build_array(to_jsonb(old) -> k, v_val)
          );
        end if;
      end if;
    end loop;
    if v_details = '{}'::jsonb then
      return coalesce(new, old);   -- touched but nothing changed
    end if;
  end if;

  insert into public.audit_log (
    organization_id, actor_id, actor_email, actor_role,
    action, entity_type, entity_id, entity_label, details
  ) values (
    v_org, auth.uid()::text, v_email, v_role,
    lower(tg_op), tg_table_name, v_new ->> 'id', v_label, v_details
  );

  return coalesce(new, old);
end $$;

-- Attach to the sensitive set (idempotent drop+create) -----------------------
do $$
declare t text;
begin
  foreach t in array array[
    'transport_requests','vehicles','drivers','fuel_logs',
    'organization_members','api_keys','organizations','profiles'
  ]
  loop
    execute format('drop trigger if exists trg_audit_%I on public.%I', t, t);
    execute format($ddl$
      create trigger trg_audit_%I
        after insert or update or delete on public.%I
        for each row execute function public.audit_row_change()
    $ddl$, t, t);
  end loop;
end $$;

-- ---------------------------------------------------------------------------
-- VERIFY:
--   select * from public.audit_log order by created_at desc limit 10;
--   -- then change something in the app (e.g. a member role) and re-run —
--   -- the change must appear with your email and old→new values.
--   -- Tamper check: try DELETE from audit_log via the API as an admin →
--   -- must fail (no delete policy).
-- ---------------------------------------------------------------------------
