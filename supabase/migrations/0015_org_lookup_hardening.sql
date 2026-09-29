-- 0015 — Close the anonymous full-row read on public.organizations
-- ---------------------------------------------------------------------------
-- BUG: 0003's "orgs code lookup" policy was `for select using (true)`, meant
-- to let the Register page validate a client code before signup. Postgres
-- RLS is row-level, not column-level, and multiple permissive SELECT
-- policies are OR'd together — so that one `using (true)` policy overrode
-- every other (more restrictive) select policy on the table and exposed the
-- FULL row (contact_email, contact_phone, billing_customer_id, settings
-- jsonb, address, max_vehicles/max_users, everything) to any unauthenticated
-- request. Confirmed live: `select=*` with just the public anon key returned
-- every column for every organization, not just client_code/name/plan_status.
--
-- FIX: drop that policy — organizations now has NO anonymous SELECT access
-- at all — and replace the lookup it existed for with a SECURITY DEFINER RPC
-- that returns exactly the 3 safe columns for one active org. The signup
-- trigger (handle_new_saas_user, 0003) is unaffected: SECURITY DEFINER
-- functions already bypass RLS, so it never depended on this policy.
-- Organizations.jsx (the platform Clients page) is unaffected too: it reads
-- via "orgs read own" (0003/0014), which is correctly scoped to a caller's
-- own orgs or a platform admin, not `using (true)`.
-- ---------------------------------------------------------------------------

drop policy if exists "orgs code lookup" on public.organizations;

create or replace function public.lookup_client_code(p_code text)
returns table (client_code text, name text, plan_status text)
language sql stable security definer set search_path = public
as $$
  select o.client_code, o.name, o.plan_status
  from public.organizations o
  where o.client_code = upper(btrim(p_code))
    and o.plan_status = 'active'
  limit 1
$$;

grant execute on function public.lookup_client_code(text) to anon, authenticated;

-- ---------------------------------------------------------------------------
-- VERIFY (run after deploying the app.jsx change in the same commit):
--   -- anon can no longer read the base table at all:
--   select * from public.organizations;  -- as anon: 0 rows
--   -- anon can still validate a code, safe columns only:
--   select * from public.lookup_client_code('TLF-001');
-- ============================================================================
