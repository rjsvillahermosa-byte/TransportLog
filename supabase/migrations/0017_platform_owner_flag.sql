-- 0017 — Real platform-owner flag (complements 0016_security_hardening.sql)
-- ---------------------------------------------------------------------------
-- 0016 (a separate, parallel security review — Codebuff) added
-- protect_member_escalation(), a BEFORE INSERT/UPDATE trigger on
-- organization_members that blocks an authenticated org Admin from
-- self-granting is_org_owner/Super Admin. Its final gate is
-- "unless the caller is_platform_super()".
--
-- But is_platform_super() (0003) was never fixed to mean "the platform
-- owner" — it checked "role = 'Super Admin' and is_org_owner in ANY org",
-- and handle_new_saas_user() (0003) legitimately sets exactly that for the
-- FIRST signup under ANY client code. Two consequences, both proven live:
--   1. Every new tenant's founding user was already, correctly-per-that-
--      definition, "a platform super" — inheriting the cross-tenant RLS
--      access every is_platform_super() OR-branch grants (0011/0013/0014).
--   2. 0016's own escalation trigger is gated by the SAME broken function:
--      an org's own first-signup owner calling is_platform_super() got
--      `true` under the old definition, so that trigger's platform-owner
--      escape hatch let them straight through — the exact self-escalation
--      it was built to stop.
--
-- This migration redefines is_platform_super() to check a single-purpose,
-- manually-granted flag instead. Every existing policy/trigger that calls
-- is_platform_super() (0003, 0011, 0012, 0013, 0014, and 0016's new trigger)
-- picks up the fix automatically — nothing else needs to change.
--
-- Run AFTER 0016_security_hardening.sql.
-- ---------------------------------------------------------------------------

alter table public.profiles add column if not exists is_platform_owner boolean not null default false;

-- One-time grant to the actual platform operator. Safe to re-run: it only
-- ever sets this for the one account, never clears a manually-granted flag
-- elsewhere.
update public.profiles set is_platform_owner = true
 where email = 'rjsvillahermosa@gmail.com' and not is_platform_owner;

create or replace function public.is_platform_super()
returns boolean language sql stable security definer set search_path = public
as $$
  select coalesce((select is_platform_owner from public.profiles where id = auth.uid()::text), false)
$$;

-- ---------------------------------------------------------------------------
-- KNOWN REMAINING GAP (not fixed by this migration — flagging for a
-- follow-up, not attempting a freehand rewrite of long PL/pgSQL bodies from
-- memory in the same pass as everything else):
--
-- Three functions inline their OWN copy of the same unscoped pattern this
-- migration just fixed centrally, instead of calling is_platform_super():
--   * 0009_bulk_enrollment.sql   — enroll_users()'s v_is_super check
--   * 0011_odometer_audit.sql   — audit_start_odo_change()'s v_allowed check
--   * 0012_orgs_ui_create.sql   — its org-creation function (same check)
-- Fixing is_platform_super() does NOT fix these — they never call it, they
-- repeat "role = 'Super Admin' and is_org_owner" directly. Each should be
-- changed to call public.is_platform_super() instead of that inline
-- subquery. Lower urgency than the two fixes above (narrower blast radius:
-- bulk-enroll seat-limit bypass, odometer-audit bypass, not cross-tenant
-- data read/write) but still real.
-- ---------------------------------------------------------------------------

-- ---------------------------------------------------------------------------
-- VERIFY:
--   select email from public.profiles where is_platform_owner;  -- exactly you
--   -- as a non-owner org Admin, via the API:
--   --   PATCH organization_members?user_id=eq.<self> {"is_org_owner": true}
--   --   → 42501 (0016's trigger), not silently applied
-- ============================================================================
