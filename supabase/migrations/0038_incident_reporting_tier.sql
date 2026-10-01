-- 0038 — Incident Reporting as a plan-gated per-org feature
-- ---------------------------------------------------------------------------
-- The incidents table, its RLS, org auto-stamp trigger (0005) and even a
-- voice-reported flow (VoiceAssistant.jsx) already existed — this migration
-- only adds the gate deciding which orgs get a manual "Report Incident"
-- button while a mission is in progress. Lives on organizations (not
-- org_settings) and is set by the platform owner from the Clients page,
-- right alongside plan_type/max_vehicles/max_users — the same paywall
-- surface, not a client-editable self-service setting.
-- ---------------------------------------------------------------------------

alter table public.organizations
  add column if not exists incident_reporting_enabled boolean not null default false;

comment on column public.organizations.incident_reporting_enabled is
  'Plan-gated: manual "Report Incident" UI on an in-progress mission. Set by the platform owner on the Clients page, not self-service. Does not affect the existing voice-reported incident flow, which has no gate.';

-- ---------------------------------------------------------------------------
-- VERIFY:
--   select client_code, plan_type, incident_reporting_enabled from public.organizations;
-- ---------------------------------------------------------------------------
