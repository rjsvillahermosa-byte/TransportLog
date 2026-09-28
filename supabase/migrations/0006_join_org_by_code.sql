-- ============================================================================
-- Migration: 0006_join_org_by_code.sql
-- FleetFlow SaaS — self-serve org joining for EXISTING accounts.
--
-- GAP: the client code is only asked at SIGNUP (handle_new_saas_user). An
-- account created before tenancy — or invited by email later — had no way
-- to join an organization without an admin running SQL.
--
-- FIX: join_org_with_code(p_code text) — an authenticated user submits a
-- client code and is linked to that org as Staff. Guards:
--   • org must exist and be active (unknown/inactive codes fail loudly)
--   • plan's max_users limit is enforced (no silent overfill)
--   • idempotent: already a member ⇒ friendly notice, no error
-- This mirrors handle_new_saas_user's rules without touching auth triggers.
--
-- Requires: 0003_saas_tenancy.sql. Re-runnable (create or replace).
-- ============================================================================

create or replace function public.join_org_with_code(p_code text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid    uuid := auth.uid();
  v_org    public.organizations%rowtype;
  v_code   text := nullif(btrim(p_code), '');
  v_count  integer;
  v_role   text;
begin
  if v_uid is null then
    raise exception 'You must be signed in to join an organization.';
  end if;
  if v_code is null then
    raise exception 'Enter the client code your fleet admin gave you.';
  end if;

  select * into v_org
    from public.organizations
   where lower(client_code) = lower(v_code)
     and plan_status = 'active';
  if not found then
    raise exception 'Unknown or inactive client code "%".', v_code;
  end if;

  -- Already linked? Idempotent success — tell the caller their role.
  select role into v_role
    from public.organization_members
   where organization_id = v_org.id and user_id = v_uid;
  if found then
    return jsonb_build_object(
      'ok', true,
      'already_member', true,
      'organization', v_org.name,
      'role', v_role
    );
  end if;

  select count(*) into v_count
    from public.organization_members
   where organization_id = v_org.id;
  if v_count >= v_org.max_users then
    raise exception 'This organization has reached its user limit. Contact the fleet admin.';
  end if;

  insert into public.organization_members (organization_id, user_id, role, is_org_owner)
  values (v_org.id, v_uid, 'Staff', false);

  return jsonb_build_object(
    'ok', true,
    'already_member', false,
    'organization', v_org.name,
    'role', 'Staff'
  );
end;
$$;

revoke all on function public.join_org_with_code(text) from public, anon;
grant execute on function public.join_org_with_code(text) to authenticated;

-- ---------------------------------------------------------------------------
-- VERIFY
--   -- as a signed-in user NOT in the org:
--   select public.join_org_with_code('TLF-001');
--   -- ⇒ {"ok": true, "already_member": false, "organization": "...", "role": "Staff"}
--   select public.join_org_with_code('TLF-001');
--   -- ⇒ {"ok": true, "already_member": true, ...}
--   select public.join_org_with_code('NOPE');
--   -- ⇒ exception 'Unknown or inactive client code "NOPE".'
-- ============================================================================
