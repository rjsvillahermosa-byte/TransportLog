-- 0019 — Resolve the enroll_users() overload ambiguity (bulk enrollment was
-- broken in production because of this)
-- ---------------------------------------------------------------------------
-- 0009 created enroll_users(p_rows jsonb). 0012 later added an overload,
-- enroll_users(p_rows jsonb, p_org uuid default null), rather than replacing
-- the first. PostgREST cannot resolve a call that supplies only p_rows
-- between two candidates when one of them makes every other parameter
-- optional — confirmed live:
--   PGRST203: Could not choose the best candidate function between:
--   public.enroll_users(p_rows => jsonb), public.enroll_users(p_rows => jsonb, p_org => uuid)
--
-- The only caller in the app, BulkEnrollCard.jsx's enrollViaRpc(), calls
-- exactly that way (`sb.rpc("enroll_users", { p_rows: rows })`), so bulk
-- enrollment has been failing for every call since 0012 first shipped this
-- overload — grep confirms no other file calls the 1-arg signature
-- specifically, so nothing depends on keeping it.
--
-- Fix: drop the 1-arg overload. The 2-arg one (p_org defaulting to null)
-- reproduces its exact behavior for a 1-arg call — same body, same "default
-- to caller's own active org when p_org is omitted" branch — so this is a
-- pure disambiguation, not a behavior change. No frontend change needed.
-- ---------------------------------------------------------------------------

drop function if exists public.enroll_users(jsonb);

-- Explicit, matching 0009's original intent: authenticated callers only.
-- (0016 already revoked anon's access to both signatures via its dynamic
-- pg_proc loop; this makes the remaining signature's grant explicit rather
-- than relying on an inherited PUBLIC grant no later migration stated.)
revoke all on function public.enroll_users(jsonb, uuid) from public, anon;
grant execute on function public.enroll_users(jsonb, uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- VERIFY (SQL editor):
--   select oid::regprocedure from pg_proc
--   where proname = 'enroll_users' and pronamespace = 'public'::regnamespace;
--   -- expect exactly one row: enroll_users(jsonb, uuid)
--   -- Then in the app: Settings -> Bulk Enrollment -> upload the template
--   -- CSV -> Enroll. Should succeed instead of failing with PGRST203.
-- ============================================================================
