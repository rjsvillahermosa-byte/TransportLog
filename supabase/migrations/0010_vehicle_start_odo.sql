-- 0010 — Vehicle baseline odometer (Start ODO at enrollment)
-- ---------------------------------------------------------------------------
-- Every vehicle gets a baseline odometer reading captured when it's added to
-- the system. Mission start ODO pre-fills from this (driver still verifies /
-- overrides with the dashboard photo), and distance math gets an anchor.
--
-- Backfill: vehicles that already have mileage history inherit the latest
-- known reading from mileage_logs so the baseline isn't empty for existing
-- fleets. Vehicles with no history stay NULL until edited.

alter table public.vehicles
  add column if not exists start_odometer_km integer;

-- latest known reading per plate (end_odometer preferred over start_odometer)
update public.vehicles v
set start_odometer_km = latest.reading
from (
  select distinct on (vehicle_plate)
    vehicle_plate,
    coalesce(end_odometer, start_odometer) as reading
  from public.mileage_logs
  where vehicle_plate is not null
  order by vehicle_plate, time_out desc nulls last, created_date desc
) latest
where latest.vehicle_plate = v.plate_number
  and v.start_odometer_km is null;

-- ---------------------------------------------------------------------------
-- VERIFY:
--   select plate_number, start_odometer_km from public.vehicles;
--   -- vehicles with trip history: baseline = their last recorded reading
--   -- brand-new vehicles: null until set in the Fleet form
-- ---------------------------------------------------------------------------
