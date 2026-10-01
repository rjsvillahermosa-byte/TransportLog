#!/usr/bin/env python3
"""Generates the one-off SQL to backfill Madison Suites' historical trips
from the physical van log (photo transcribed 2026-10-01). Not a schema
migration — run once by hand in the SQL Editor, then discard.

Resolves organization_id / driver / vehicle via MAD-001's single existing
driver and vehicle (confirmed via the TLF-001->MAD-001 migration earlier
this session), so no literal IDs need to be hand-plugged by the user.
"""
import uuid

ROWS = [
    # date, time_out, time_in, purpose, pickup, dest, requester_type, booking_type, guest_name, dept, start_odo, end_odo, remarks
    ("2026-09-09", "20:00", None,    "Go Home",     "Madison", "Labangon",        "Errand", "Errand",         "Ma'am Izyl", None, 1543, 1595, "Forward - Labangon"),
    ("2026-09-09", "10:05", "11:24", "Check out",   "Madison", "MCIA",            "Guest",  "Drop-off",       "Hotel Guest", None, 1595, 1607, "Check out"),
    ("2026-09-10", "04:00", "04:58", "Pick-up",     "Airport", "Madison",         "Guest",  "Airport Pick-up","Hotel Guest", None, 1607, 1618, "Check in"),
    ("2026-09-10", "13:00", "15:00", "Purchase",    "Madison", "LLC Market",      "Errand", "Errand",         "Kenneth", None, 1618, 1624, "Bubble soap"),
    ("2026-09-11", "04:00", "09:30", "Check out",   "Madison", "Airport",         "Guest",  "Drop-off",       "Hotel Guest", None, 1624, 1634, "Done, drop off"),
    ("2026-09-11", "08:45", "16:31", "Toll payment","Madison", "Anywhere",        "Errand", "Errand",         "Ma'am Izyl", None, 1634, 1667, "Visit White House"),
    ("2026-09-12", "06:30", "17:00", "Fiesta",      "Madison", "Maribago",        "Errand", "Errand",         "H.R & Housekeeping", "Housekeeping", 1667, 1684, "Training"),
    ("2026-09-12", "18:00", "19:32", "Go Home",     "Madison", "South Bus Terminal","Errand","Errand",        "Ma'am Izyl", "H.R", 1684, 1716, "Forward, South bus"),
    ("2026-09-14", "06:00", "06:41", "Check out",   "Madison", "Airport",         "Guest",  "Drop-off",       "Madison Guest", None, 1716, 1727, "Check out"),
    ("2026-09-19", "17:00", "17:40", "Check out",   "Madison", "Airport",         "Guest",  "Drop-off",       "Hotel Guest", None, 1727, 1744, "Check out"),
    ("2026-09-21", "10:00", "13:00", "Purchase",    "Madison", "LLC Market",      "Errand", "Errand",         "Kenneth F.O.", "Front Office", 1744, 1757, "Purchase soap"),
    ("2026-09-22", "22:00", "22:50", "Check out",   "Madison", "Airport",         "Guest",  "Drop-off",       "Hotel Guest", None, 1757, 1768, "Check out"),
    ("2026-09-23", "21:30", "22:00", "Check in",    "Airport", "Madison",         "Guest",  "Airport Pick-up","Hotel Guest", None, 1768, 1779, "Check in"),
    # gap in the physical log (9-23 to 9-29, ~87km unlogged) - flagged to the user, not fabricated
    ("2026-09-29", "09:00", "09:41", "Check out",   "Madison", "Airport",         "Guest",  "Drop-off",       "Hotel Guest", None, 1866, 1878, "Check out"),
    ("2026-09-29", "11:40", "12:00", "Check in",    "Airport", "Madison",         "Guest",  "Airport Pick-up","Hotel Guest", None, 1878, 1888, "Check in"),
    ("2026-09-29", "13:30", "14:15", "Meeting",     "Madison", "Labangon",        "Errand", "Errand",         "Sir Rex & Kenneth", None, 1888, 1922, None),
    ("2026-09-29", "16:00", "16:40", "Check out",   "Madison", "Airport",         "Guest",  "Drop-off",       "Hotel Guest", None, 1922, 1935, "Check out"),
    ("2026-09-29", "17:10", "19:49", "Meeting",     "Labangon","Madison",         "Errand", "Errand",         "Sir Rex & Kenneth", None, 1935, 1975, None),
    ("2026-09-30", "08:00", "09:11", "Check out",   "Madison", "Airport",         "Guest",  "Drop-off",       "Hotel Guest", None, 1975, 1993, None),
]

def sql_str(v):
    if v is None:
        return "null"
    return "'" + str(v).replace("'", "''") + "'"

def sql_int(v):
    return "null" if v is None else str(v)

out = []
out.append("-- Madison Suites van-log backfill (19 historical trips, transcribed from the physical")
out.append("-- mileage tracker, 2026-10-01). One-off data import, not a schema migration.")
out.append("-- Resolves org/driver/vehicle via MAD-001's single existing driver+vehicle.")
out.append("")
out.append("do $$")
out.append("declare")
out.append("  v_org_id uuid;")
out.append("  v_driver_id text;")
out.append("  v_driver_name text;")
out.append("  v_vehicle_id text;")
out.append("  v_vehicle_plate text;")
out.append("  v_request_id text;")
out.append("begin")
out.append("  select id into v_org_id from public.organizations where client_code = 'MAD-001';")
out.append("  if v_org_id is null then raise exception 'MAD-001 not found'; end if;")
out.append("")
out.append("  select id, full_name into v_driver_id, v_driver_name")
out.append("    from public.drivers where organization_id = v_org_id limit 1;")
out.append("  select id, plate_number into v_vehicle_id, v_vehicle_plate")
out.append("    from public.vehicles where organization_id = v_org_id limit 1;")
out.append("  if v_driver_id is null then raise exception 'No driver found for MAD-001'; end if;")
out.append("  if v_vehicle_id is null then raise exception 'No vehicle found for MAD-001'; end if;")
out.append("")

for i, (date, t_out, t_in, purpose, pickup, dest, req_type, booking_type, guest_name, dept, start_odo, end_odo, remarks) in enumerate(ROWS, start=1):
    req_id = str(uuid.uuid4())
    mission_id = f"VANLOG-{date.replace('-', '')}-{i:02d}"
    schedule_time = t_out if t_out else t_in  # fall back to time_in if time_out illegible
    time_out_ts = f"'{date} {t_out}:00+08'" if t_out else "null"
    time_in_ts = f"'{date} {t_in}:00+08'" if t_in else "null"
    distance = end_odo - start_odo

    out.append(f"  v_request_id := {sql_str(req_id)};")
    out.append("  insert into public.transport_requests (")
    out.append("    id, mission_id, requester_type, requested_by, guest_name, pax_count, booking_type,")
    out.append("    pickup_location, destination, schedule_date, schedule_time,")
    out.append("    assigned_driver_id, assigned_driver_name, vehicle_id, vehicle_plate, department,")
    out.append("    special_notes, status, organization_id")
    out.append("  ) values (")
    out.append(f"    v_request_id, {sql_str(mission_id)}, {sql_str(req_type)}, {sql_str(guest_name)}, {sql_str(guest_name)}, 1, {sql_str(booking_type)},")
    out.append(f"    {sql_str(pickup)}, {sql_str(dest)}, {sql_str(date)}, {sql_str(schedule_time)},")
    out.append(f"    v_driver_id, v_driver_name, v_vehicle_id, v_vehicle_plate, {sql_str(dept)},")
    out.append(f"    {sql_str('Imported from physical van log: ' + purpose)}, 'Completed', v_org_id")
    out.append("  );")
    out.append("  insert into public.mileage_logs (")
    out.append("    id, request_id, mission_id, driver_id, driver_name, vehicle_plate, guest_name,")
    out.append("    requester_type, department, pax_count, booking_type, pickup_location, destination,")
    out.append("    time_out, time_in, start_odometer, end_odometer, distance, remarks, status, organization_id")
    out.append("  ) values (")
    out.append(f"    (gen_random_uuid())::text, v_request_id, {sql_str(mission_id)}, v_driver_id, v_driver_name, v_vehicle_plate, {sql_str(guest_name)},")
    out.append(f"    {sql_str(req_type)}, {sql_str(dept)}, 1, {sql_str(booking_type)}, {sql_str(pickup)}, {sql_str(dest)},")
    out.append(f"    {time_out_ts}, {time_in_ts}, {sql_int(start_odo)}, {sql_int(end_odo)}, {sql_int(distance)}, {sql_str(remarks)}, 'Completed', v_org_id")
    out.append("  );")
    out.append("")

out.append("end $$;")
out.append("")
out.append("-- VERIFY:")
out.append("--   select mission_id, schedule_date, pickup_location, destination, status")
out.append("--   from public.transport_requests where mission_id like 'VANLOG-%' order by schedule_date;")
out.append("--   -- expect 19 rows")
out.append("--   select mission_id, start_odometer, end_odometer, distance")
out.append("--   from public.mileage_logs where mission_id like 'VANLOG-%' order by start_odometer;")
out.append("--   -- expect the chain 1543->1595->1607->...->1993, with one real gap 1779->1866")

print("\n".join(out))
