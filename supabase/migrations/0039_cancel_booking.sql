-- Cancel Booking: a Supervisor+ action that voids a booking with a required
-- reason, instead of the existing hard-delete (which has no role gate and
-- leaves no trace). Adds 'Cancelled' as a real status plus who/why/when
-- columns; the existing audit_row_change() trigger on transport_requests
-- (0027) already captures the update automatically.

alter table public.transport_requests
  drop constraint if exists transport_requests_status_check;

alter table public.transport_requests
  add constraint transport_requests_status_check
    check (status in ('Pending', 'In Progress', 'Completed', 'Cancelled'));

alter table public.transport_requests
  add column if not exists cancellation_reason text,
  add column if not exists cancelled_by text,
  add column if not exists cancelled_at timestamptz;

-- Seed the cancel_booking capability into the Master Permissions matrix
-- (0029) so it's usable immediately, not blocked until someone opens that
-- page and flips it manually — same roles as manage_fleet.
insert into public.role_permissions (role, capability, allowed) values
  ('Super Admin','cancel_booking', true),
  ('Admin',      'cancel_booking', true),
  ('Supervisor', 'cancel_booking', true),
  ('Driver',     'cancel_booking', false),
  ('Staff',      'cancel_booking', false)
on conflict do nothing;
