-- Open Cancel Booking to Staff too (0039 seeded it Supervisor+ only).
-- The cancellation reason was already required at the app layer and stays
-- that way — this just widens who can do it.

update public.role_permissions
  set allowed = true, updated_at = now()
  where capability = 'cancel_booking' and role = 'Staff';
