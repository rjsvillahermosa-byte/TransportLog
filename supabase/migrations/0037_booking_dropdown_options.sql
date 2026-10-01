-- 0037 — Org-editable, toggleable Booking Type list (joins the existing
-- per-org location_presets as a client-customizable dropdown)
-- ---------------------------------------------------------------------------
-- Booking Type on New Booking was a hardcoded constant (BOOKING_TYPES in
-- src/lib/utils.js) — every org saw the same 4 options, no way to add,
-- remove, or hide one. This adds a per-org column, same ownership model as
-- location_presets (0001): one org_settings row per org, RLS already scopes
-- reads/writes to that org's own members, so one client's edits can never
-- surface in another client's UI.
--
-- Entries on both this column and location_presets now carry an `enabled`
-- flag. The Settings UI (ClientPrefsCard) edits a local draft and only
-- writes here on an explicit "Publish" — toggling an entry off doesn't
-- affect the live New Booking page until that happens.
-- ---------------------------------------------------------------------------

alter table public.org_settings
  add column if not exists booking_type_options jsonb not null default '[]'::jsonb;

comment on column public.org_settings.booking_type_options is
  'Per-org Booking Type dropdown on New Booking. Array of {value, enabled}. Empty = app falls back to the original 4-option default (src/lib/utils.js BOOKING_TYPES) so existing orgs see no change until they customize.';

-- ---------------------------------------------------------------------------
-- VERIFY:
--   select organization_id, booking_type_options from public.org_settings;
-- ---------------------------------------------------------------------------
