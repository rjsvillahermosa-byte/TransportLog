-- 0032 — Approval gate: signups join as Pending until their org approves
-- ---------------------------------------------------------------------------
-- Why: a client code is semi-public (printed QRs, welcome kits). Today any
-- stranger who learns the code joins that org as Active Staff and can read
-- its directory and see its data. With this gate:
--   * FIRST signup on a code still becomes the active owner (the bootstrap
--     the operator intends when handing over the welcome kit).
--   * EVERY later signup creates the membership with status = 'Pending'.
--     The existing RLS helpers (get_my_org_role / get_my_org_ids /
--     assert_org_access) all require status = 'Active', so a pending member
--     sees NO data — the enforcement floor already exists; we only flip the
--     initial state.
--   * The org's admins approve (Members panel → Approve) which flips the
--     row to Active; they can also reject (Disabled) — both use the existing
--     "members admins manage" policy, so no new write paths.
--   * Seat caps count Pending rows too (status <> 'Disabled') — a flood of
--     unapproved signups can't exceed max_users.
-- Idempotent. Run in the SQL editor.
-- ---------------------------------------------------------------------------

-- 1) 'Pending' is a legal membership status ----------------------------------
alter table public.organization_members
  drop constraint if exists organization_members_status_check;
alter table public.organization_members
  add constraint organization_members_status_check
  check (status in ('Pending','Active','Disabled'));

-- 2) Signup trigger: later members land as Pending ---------------------------
create or replace function public.handle_new_saas_user()
returns trigger
language plpgsql security definer set search_path = public
as $$
declare
  code   text;
  org    public.organizations%rowtype;
  n      integer;
begin
  code := nullif(btrim(new.raw_user_meta_data ->> 'client_code'), '');

  if code is null then
    -- No client code → legacy flow (0001's handle_new_user creates the
    -- profiles row). Platform-side accounts only; nothing tenant-scoped
    -- until linked to an organization.
    return new;
  end if;

  select * into org from public.organizations
   where client_code = code and plan_status = 'active';
  if not found then
    raise exception 'Invalid or inactive client code';
  end if;

  -- Seat cap counts occupied seats: Active + Pending (not Disabled).
  select count(*) into n from public.organization_members
   where organization_id = org.id and status <> 'Disabled';

  if n >= org.max_users then
    raise exception 'This organization has reached its user limit. Contact the fleet admin.';
  end if;

  insert into public.organization_members (organization_id, user_id, role, is_org_owner, status)
  values (
    org.id,
    new.id,
    case when n = 0 then 'Super Admin' else 'Staff' end,
    n = 0,
    case when n = 0 then 'Active' else 'Pending' end
  )
  on conflict do nothing;

  return new;
end $$;

-- ---------------------------------------------------------------------------
-- VERIFY:
--   -- constraint allows Pending:
--   select conname, pg_get_constraintdef(oid) from pg_constraint
--    where conrelid = 'public.organization_members'::regclass
--      and conname = 'organization_members_status_check';
--   -- new signup with a valid code (not first member) → row appears with
--   -- status 'Pending'; that user's API reads return [] until approved.
--   -- Approve from the app: Clients → Members → Approve (sets 'Active').
-- ---------------------------------------------------------------------------
