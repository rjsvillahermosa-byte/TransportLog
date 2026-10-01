-- Madison Suites van-log backfill (19 historical trips, transcribed from the physical
-- mileage tracker, 2026-10-01). One-off data import, not a schema migration.
-- Resolves org/driver/vehicle via MAD-001's single existing driver+vehicle.

do $$
declare
  v_org_id uuid;
  v_driver_id text;
  v_driver_name text;
  v_vehicle_id text;
  v_vehicle_plate text;
  v_request_id text;
begin
  select id into v_org_id from public.organizations where client_code = 'MAD-001';
  if v_org_id is null then raise exception 'MAD-001 not found'; end if;

  select id, full_name into v_driver_id, v_driver_name
    from public.drivers where organization_id = v_org_id limit 1;
  select id, plate_number into v_vehicle_id, v_vehicle_plate
    from public.vehicles where organization_id = v_org_id limit 1;
  if v_driver_id is null then raise exception 'No driver found for MAD-001'; end if;
  if v_vehicle_id is null then raise exception 'No vehicle found for MAD-001'; end if;

  v_request_id := '5789d93e-8bfa-464d-a5e7-146ae824387a';
  insert into public.transport_requests (
    id, mission_id, requester_type, requested_by, guest_name, pax_count, booking_type,
    pickup_location, destination, schedule_date, schedule_time,
    assigned_driver_id, assigned_driver_name, vehicle_id, vehicle_plate, department,
    special_notes, status, organization_id
  ) values (
    v_request_id, 'VANLOG-20260909-01', 'Errand', 'Ma''am Izyl', 'Ma''am Izyl', 1, 'Errand',
    'Madison', 'Labangon', '2026-09-09', '20:00',
    v_driver_id, v_driver_name, v_vehicle_id, v_vehicle_plate, null,
    'Imported from physical van log: Go Home', 'Completed', v_org_id
  );
  insert into public.mileage_logs (
    id, request_id, mission_id, driver_id, driver_name, vehicle_plate, guest_name,
    requester_type, department, pax_count, booking_type, pickup_location, destination,
    time_out, time_in, start_odometer, end_odometer, distance, remarks, status, organization_id
  ) values (
    (gen_random_uuid())::text, v_request_id, 'VANLOG-20260909-01', v_driver_id, v_driver_name, v_vehicle_plate, 'Ma''am Izyl',
    'Errand', null, 1, 'Errand', 'Madison', 'Labangon',
    '2026-09-09 20:00:00+08', null, 1543, 1595, 52, 'Forward - Labangon', 'Completed', v_org_id
  );

  v_request_id := 'e5c99f3e-7852-430b-9a67-81be2817069d';
  insert into public.transport_requests (
    id, mission_id, requester_type, requested_by, guest_name, pax_count, booking_type,
    pickup_location, destination, schedule_date, schedule_time,
    assigned_driver_id, assigned_driver_name, vehicle_id, vehicle_plate, department,
    special_notes, status, organization_id
  ) values (
    v_request_id, 'VANLOG-20260909-02', 'Guest', 'Hotel Guest', 'Hotel Guest', 1, 'Drop-off',
    'Madison', 'MCIA', '2026-09-09', '10:05',
    v_driver_id, v_driver_name, v_vehicle_id, v_vehicle_plate, null,
    'Imported from physical van log: Check out', 'Completed', v_org_id
  );
  insert into public.mileage_logs (
    id, request_id, mission_id, driver_id, driver_name, vehicle_plate, guest_name,
    requester_type, department, pax_count, booking_type, pickup_location, destination,
    time_out, time_in, start_odometer, end_odometer, distance, remarks, status, organization_id
  ) values (
    (gen_random_uuid())::text, v_request_id, 'VANLOG-20260909-02', v_driver_id, v_driver_name, v_vehicle_plate, 'Hotel Guest',
    'Guest', null, 1, 'Drop-off', 'Madison', 'MCIA',
    '2026-09-09 10:05:00+08', '2026-09-09 11:24:00+08', 1595, 1607, 12, 'Check out', 'Completed', v_org_id
  );

  v_request_id := 'ced92e3e-6149-4d7e-9f61-3489467652a2';
  insert into public.transport_requests (
    id, mission_id, requester_type, requested_by, guest_name, pax_count, booking_type,
    pickup_location, destination, schedule_date, schedule_time,
    assigned_driver_id, assigned_driver_name, vehicle_id, vehicle_plate, department,
    special_notes, status, organization_id
  ) values (
    v_request_id, 'VANLOG-20260910-03', 'Guest', 'Hotel Guest', 'Hotel Guest', 1, 'Airport Pick-up',
    'Airport', 'Madison', '2026-09-10', '04:00',
    v_driver_id, v_driver_name, v_vehicle_id, v_vehicle_plate, null,
    'Imported from physical van log: Pick-up', 'Completed', v_org_id
  );
  insert into public.mileage_logs (
    id, request_id, mission_id, driver_id, driver_name, vehicle_plate, guest_name,
    requester_type, department, pax_count, booking_type, pickup_location, destination,
    time_out, time_in, start_odometer, end_odometer, distance, remarks, status, organization_id
  ) values (
    (gen_random_uuid())::text, v_request_id, 'VANLOG-20260910-03', v_driver_id, v_driver_name, v_vehicle_plate, 'Hotel Guest',
    'Guest', null, 1, 'Airport Pick-up', 'Airport', 'Madison',
    '2026-09-10 04:00:00+08', '2026-09-10 04:58:00+08', 1607, 1618, 11, 'Check in', 'Completed', v_org_id
  );

  v_request_id := '890a19a3-d9e3-4ac8-b283-2caf7f3e8327';
  insert into public.transport_requests (
    id, mission_id, requester_type, requested_by, guest_name, pax_count, booking_type,
    pickup_location, destination, schedule_date, schedule_time,
    assigned_driver_id, assigned_driver_name, vehicle_id, vehicle_plate, department,
    special_notes, status, organization_id
  ) values (
    v_request_id, 'VANLOG-20260910-04', 'Errand', 'Kenneth', 'Kenneth', 1, 'Errand',
    'Madison', 'LLC Market', '2026-09-10', '13:00',
    v_driver_id, v_driver_name, v_vehicle_id, v_vehicle_plate, null,
    'Imported from physical van log: Purchase', 'Completed', v_org_id
  );
  insert into public.mileage_logs (
    id, request_id, mission_id, driver_id, driver_name, vehicle_plate, guest_name,
    requester_type, department, pax_count, booking_type, pickup_location, destination,
    time_out, time_in, start_odometer, end_odometer, distance, remarks, status, organization_id
  ) values (
    (gen_random_uuid())::text, v_request_id, 'VANLOG-20260910-04', v_driver_id, v_driver_name, v_vehicle_plate, 'Kenneth',
    'Errand', null, 1, 'Errand', 'Madison', 'LLC Market',
    '2026-09-10 13:00:00+08', '2026-09-10 15:00:00+08', 1618, 1624, 6, 'Bubble soap', 'Completed', v_org_id
  );

  v_request_id := '0dbf2f75-e0e5-4759-b46a-e783d4474aaf';
  insert into public.transport_requests (
    id, mission_id, requester_type, requested_by, guest_name, pax_count, booking_type,
    pickup_location, destination, schedule_date, schedule_time,
    assigned_driver_id, assigned_driver_name, vehicle_id, vehicle_plate, department,
    special_notes, status, organization_id
  ) values (
    v_request_id, 'VANLOG-20260911-05', 'Guest', 'Hotel Guest', 'Hotel Guest', 1, 'Drop-off',
    'Madison', 'Airport', '2026-09-11', '04:00',
    v_driver_id, v_driver_name, v_vehicle_id, v_vehicle_plate, null,
    'Imported from physical van log: Check out', 'Completed', v_org_id
  );
  insert into public.mileage_logs (
    id, request_id, mission_id, driver_id, driver_name, vehicle_plate, guest_name,
    requester_type, department, pax_count, booking_type, pickup_location, destination,
    time_out, time_in, start_odometer, end_odometer, distance, remarks, status, organization_id
  ) values (
    (gen_random_uuid())::text, v_request_id, 'VANLOG-20260911-05', v_driver_id, v_driver_name, v_vehicle_plate, 'Hotel Guest',
    'Guest', null, 1, 'Drop-off', 'Madison', 'Airport',
    '2026-09-11 04:00:00+08', '2026-09-11 09:30:00+08', 1624, 1634, 10, 'Done, drop off', 'Completed', v_org_id
  );

  v_request_id := '3c05e420-673d-4b24-b289-a7102e77699c';
  insert into public.transport_requests (
    id, mission_id, requester_type, requested_by, guest_name, pax_count, booking_type,
    pickup_location, destination, schedule_date, schedule_time,
    assigned_driver_id, assigned_driver_name, vehicle_id, vehicle_plate, department,
    special_notes, status, organization_id
  ) values (
    v_request_id, 'VANLOG-20260911-06', 'Errand', 'Ma''am Izyl', 'Ma''am Izyl', 1, 'Errand',
    'Madison', 'Anywhere', '2026-09-11', '08:45',
    v_driver_id, v_driver_name, v_vehicle_id, v_vehicle_plate, null,
    'Imported from physical van log: Toll payment', 'Completed', v_org_id
  );
  insert into public.mileage_logs (
    id, request_id, mission_id, driver_id, driver_name, vehicle_plate, guest_name,
    requester_type, department, pax_count, booking_type, pickup_location, destination,
    time_out, time_in, start_odometer, end_odometer, distance, remarks, status, organization_id
  ) values (
    (gen_random_uuid())::text, v_request_id, 'VANLOG-20260911-06', v_driver_id, v_driver_name, v_vehicle_plate, 'Ma''am Izyl',
    'Errand', null, 1, 'Errand', 'Madison', 'Anywhere',
    '2026-09-11 08:45:00+08', '2026-09-11 16:31:00+08', 1634, 1667, 33, 'Visit White House', 'Completed', v_org_id
  );

  v_request_id := '334bd604-24af-44a3-8f87-9721e2d247ee';
  insert into public.transport_requests (
    id, mission_id, requester_type, requested_by, guest_name, pax_count, booking_type,
    pickup_location, destination, schedule_date, schedule_time,
    assigned_driver_id, assigned_driver_name, vehicle_id, vehicle_plate, department,
    special_notes, status, organization_id
  ) values (
    v_request_id, 'VANLOG-20260912-07', 'Errand', 'H.R & Housekeeping', 'H.R & Housekeeping', 1, 'Errand',
    'Madison', 'Maribago', '2026-09-12', '06:30',
    v_driver_id, v_driver_name, v_vehicle_id, v_vehicle_plate, 'Housekeeping',
    'Imported from physical van log: Fiesta', 'Completed', v_org_id
  );
  insert into public.mileage_logs (
    id, request_id, mission_id, driver_id, driver_name, vehicle_plate, guest_name,
    requester_type, department, pax_count, booking_type, pickup_location, destination,
    time_out, time_in, start_odometer, end_odometer, distance, remarks, status, organization_id
  ) values (
    (gen_random_uuid())::text, v_request_id, 'VANLOG-20260912-07', v_driver_id, v_driver_name, v_vehicle_plate, 'H.R & Housekeeping',
    'Errand', 'Housekeeping', 1, 'Errand', 'Madison', 'Maribago',
    '2026-09-12 06:30:00+08', '2026-09-12 17:00:00+08', 1667, 1684, 17, 'Training', 'Completed', v_org_id
  );

  v_request_id := 'e7cbbb34-3743-4d0f-92ae-fe643ef29e46';
  insert into public.transport_requests (
    id, mission_id, requester_type, requested_by, guest_name, pax_count, booking_type,
    pickup_location, destination, schedule_date, schedule_time,
    assigned_driver_id, assigned_driver_name, vehicle_id, vehicle_plate, department,
    special_notes, status, organization_id
  ) values (
    v_request_id, 'VANLOG-20260912-08', 'Errand', 'Ma''am Izyl', 'Ma''am Izyl', 1, 'Errand',
    'Madison', 'South Bus Terminal', '2026-09-12', '18:00',
    v_driver_id, v_driver_name, v_vehicle_id, v_vehicle_plate, 'H.R',
    'Imported from physical van log: Go Home', 'Completed', v_org_id
  );
  insert into public.mileage_logs (
    id, request_id, mission_id, driver_id, driver_name, vehicle_plate, guest_name,
    requester_type, department, pax_count, booking_type, pickup_location, destination,
    time_out, time_in, start_odometer, end_odometer, distance, remarks, status, organization_id
  ) values (
    (gen_random_uuid())::text, v_request_id, 'VANLOG-20260912-08', v_driver_id, v_driver_name, v_vehicle_plate, 'Ma''am Izyl',
    'Errand', 'H.R', 1, 'Errand', 'Madison', 'South Bus Terminal',
    '2026-09-12 18:00:00+08', '2026-09-12 19:32:00+08', 1684, 1716, 32, 'Forward, South bus', 'Completed', v_org_id
  );

  v_request_id := 'e9812d1f-d2dc-4f0d-a1f6-7dd7fca7be99';
  insert into public.transport_requests (
    id, mission_id, requester_type, requested_by, guest_name, pax_count, booking_type,
    pickup_location, destination, schedule_date, schedule_time,
    assigned_driver_id, assigned_driver_name, vehicle_id, vehicle_plate, department,
    special_notes, status, organization_id
  ) values (
    v_request_id, 'VANLOG-20260914-09', 'Guest', 'Madison Guest', 'Madison Guest', 1, 'Drop-off',
    'Madison', 'Airport', '2026-09-14', '06:00',
    v_driver_id, v_driver_name, v_vehicle_id, v_vehicle_plate, null,
    'Imported from physical van log: Check out', 'Completed', v_org_id
  );
  insert into public.mileage_logs (
    id, request_id, mission_id, driver_id, driver_name, vehicle_plate, guest_name,
    requester_type, department, pax_count, booking_type, pickup_location, destination,
    time_out, time_in, start_odometer, end_odometer, distance, remarks, status, organization_id
  ) values (
    (gen_random_uuid())::text, v_request_id, 'VANLOG-20260914-09', v_driver_id, v_driver_name, v_vehicle_plate, 'Madison Guest',
    'Guest', null, 1, 'Drop-off', 'Madison', 'Airport',
    '2026-09-14 06:00:00+08', '2026-09-14 06:41:00+08', 1716, 1727, 11, 'Check out', 'Completed', v_org_id
  );

  v_request_id := '42b11256-4e71-4910-bf83-94a174f9cb45';
  insert into public.transport_requests (
    id, mission_id, requester_type, requested_by, guest_name, pax_count, booking_type,
    pickup_location, destination, schedule_date, schedule_time,
    assigned_driver_id, assigned_driver_name, vehicle_id, vehicle_plate, department,
    special_notes, status, organization_id
  ) values (
    v_request_id, 'VANLOG-20260919-10', 'Guest', 'Hotel Guest', 'Hotel Guest', 1, 'Drop-off',
    'Madison', 'Airport', '2026-09-19', '17:00',
    v_driver_id, v_driver_name, v_vehicle_id, v_vehicle_plate, null,
    'Imported from physical van log: Check out', 'Completed', v_org_id
  );
  insert into public.mileage_logs (
    id, request_id, mission_id, driver_id, driver_name, vehicle_plate, guest_name,
    requester_type, department, pax_count, booking_type, pickup_location, destination,
    time_out, time_in, start_odometer, end_odometer, distance, remarks, status, organization_id
  ) values (
    (gen_random_uuid())::text, v_request_id, 'VANLOG-20260919-10', v_driver_id, v_driver_name, v_vehicle_plate, 'Hotel Guest',
    'Guest', null, 1, 'Drop-off', 'Madison', 'Airport',
    '2026-09-19 17:00:00+08', '2026-09-19 17:40:00+08', 1727, 1744, 17, 'Check out', 'Completed', v_org_id
  );

  v_request_id := '1f8b6512-d08a-4176-9d7b-8b0ae561cea4';
  insert into public.transport_requests (
    id, mission_id, requester_type, requested_by, guest_name, pax_count, booking_type,
    pickup_location, destination, schedule_date, schedule_time,
    assigned_driver_id, assigned_driver_name, vehicle_id, vehicle_plate, department,
    special_notes, status, organization_id
  ) values (
    v_request_id, 'VANLOG-20260921-11', 'Errand', 'Kenneth F.O.', 'Kenneth F.O.', 1, 'Errand',
    'Madison', 'LLC Market', '2026-09-21', '10:00',
    v_driver_id, v_driver_name, v_vehicle_id, v_vehicle_plate, 'Front Office',
    'Imported from physical van log: Purchase', 'Completed', v_org_id
  );
  insert into public.mileage_logs (
    id, request_id, mission_id, driver_id, driver_name, vehicle_plate, guest_name,
    requester_type, department, pax_count, booking_type, pickup_location, destination,
    time_out, time_in, start_odometer, end_odometer, distance, remarks, status, organization_id
  ) values (
    (gen_random_uuid())::text, v_request_id, 'VANLOG-20260921-11', v_driver_id, v_driver_name, v_vehicle_plate, 'Kenneth F.O.',
    'Errand', 'Front Office', 1, 'Errand', 'Madison', 'LLC Market',
    '2026-09-21 10:00:00+08', '2026-09-21 13:00:00+08', 1744, 1757, 13, 'Purchase soap', 'Completed', v_org_id
  );

  v_request_id := '98e2ea8a-24fa-4eb7-94d7-defa6e8fac93';
  insert into public.transport_requests (
    id, mission_id, requester_type, requested_by, guest_name, pax_count, booking_type,
    pickup_location, destination, schedule_date, schedule_time,
    assigned_driver_id, assigned_driver_name, vehicle_id, vehicle_plate, department,
    special_notes, status, organization_id
  ) values (
    v_request_id, 'VANLOG-20260922-12', 'Guest', 'Hotel Guest', 'Hotel Guest', 1, 'Drop-off',
    'Madison', 'Airport', '2026-09-22', '22:00',
    v_driver_id, v_driver_name, v_vehicle_id, v_vehicle_plate, null,
    'Imported from physical van log: Check out', 'Completed', v_org_id
  );
  insert into public.mileage_logs (
    id, request_id, mission_id, driver_id, driver_name, vehicle_plate, guest_name,
    requester_type, department, pax_count, booking_type, pickup_location, destination,
    time_out, time_in, start_odometer, end_odometer, distance, remarks, status, organization_id
  ) values (
    (gen_random_uuid())::text, v_request_id, 'VANLOG-20260922-12', v_driver_id, v_driver_name, v_vehicle_plate, 'Hotel Guest',
    'Guest', null, 1, 'Drop-off', 'Madison', 'Airport',
    '2026-09-22 22:00:00+08', '2026-09-22 22:50:00+08', 1757, 1768, 11, 'Check out', 'Completed', v_org_id
  );

  v_request_id := '28d9c884-2aa4-4a88-8f0e-9a3b385f7994';
  insert into public.transport_requests (
    id, mission_id, requester_type, requested_by, guest_name, pax_count, booking_type,
    pickup_location, destination, schedule_date, schedule_time,
    assigned_driver_id, assigned_driver_name, vehicle_id, vehicle_plate, department,
    special_notes, status, organization_id
  ) values (
    v_request_id, 'VANLOG-20260923-13', 'Guest', 'Hotel Guest', 'Hotel Guest', 1, 'Airport Pick-up',
    'Airport', 'Madison', '2026-09-23', '21:30',
    v_driver_id, v_driver_name, v_vehicle_id, v_vehicle_plate, null,
    'Imported from physical van log: Check in', 'Completed', v_org_id
  );
  insert into public.mileage_logs (
    id, request_id, mission_id, driver_id, driver_name, vehicle_plate, guest_name,
    requester_type, department, pax_count, booking_type, pickup_location, destination,
    time_out, time_in, start_odometer, end_odometer, distance, remarks, status, organization_id
  ) values (
    (gen_random_uuid())::text, v_request_id, 'VANLOG-20260923-13', v_driver_id, v_driver_name, v_vehicle_plate, 'Hotel Guest',
    'Guest', null, 1, 'Airport Pick-up', 'Airport', 'Madison',
    '2026-09-23 21:30:00+08', '2026-09-23 22:00:00+08', 1768, 1779, 11, 'Check in', 'Completed', v_org_id
  );

  v_request_id := '74154882-3922-4e56-a07d-ede74b9582e2';
  insert into public.transport_requests (
    id, mission_id, requester_type, requested_by, guest_name, pax_count, booking_type,
    pickup_location, destination, schedule_date, schedule_time,
    assigned_driver_id, assigned_driver_name, vehicle_id, vehicle_plate, department,
    special_notes, status, organization_id
  ) values (
    v_request_id, 'VANLOG-20260929-14', 'Guest', 'Hotel Guest', 'Hotel Guest', 1, 'Drop-off',
    'Madison', 'Airport', '2026-09-29', '09:00',
    v_driver_id, v_driver_name, v_vehicle_id, v_vehicle_plate, null,
    'Imported from physical van log: Check out', 'Completed', v_org_id
  );
  insert into public.mileage_logs (
    id, request_id, mission_id, driver_id, driver_name, vehicle_plate, guest_name,
    requester_type, department, pax_count, booking_type, pickup_location, destination,
    time_out, time_in, start_odometer, end_odometer, distance, remarks, status, organization_id
  ) values (
    (gen_random_uuid())::text, v_request_id, 'VANLOG-20260929-14', v_driver_id, v_driver_name, v_vehicle_plate, 'Hotel Guest',
    'Guest', null, 1, 'Drop-off', 'Madison', 'Airport',
    '2026-09-29 09:00:00+08', '2026-09-29 09:41:00+08', 1866, 1878, 12, 'Check out', 'Completed', v_org_id
  );

  v_request_id := 'e654f00d-4643-471e-b722-93bf77b18c8c';
  insert into public.transport_requests (
    id, mission_id, requester_type, requested_by, guest_name, pax_count, booking_type,
    pickup_location, destination, schedule_date, schedule_time,
    assigned_driver_id, assigned_driver_name, vehicle_id, vehicle_plate, department,
    special_notes, status, organization_id
  ) values (
    v_request_id, 'VANLOG-20260929-15', 'Guest', 'Hotel Guest', 'Hotel Guest', 1, 'Airport Pick-up',
    'Airport', 'Madison', '2026-09-29', '11:40',
    v_driver_id, v_driver_name, v_vehicle_id, v_vehicle_plate, null,
    'Imported from physical van log: Check in', 'Completed', v_org_id
  );
  insert into public.mileage_logs (
    id, request_id, mission_id, driver_id, driver_name, vehicle_plate, guest_name,
    requester_type, department, pax_count, booking_type, pickup_location, destination,
    time_out, time_in, start_odometer, end_odometer, distance, remarks, status, organization_id
  ) values (
    (gen_random_uuid())::text, v_request_id, 'VANLOG-20260929-15', v_driver_id, v_driver_name, v_vehicle_plate, 'Hotel Guest',
    'Guest', null, 1, 'Airport Pick-up', 'Airport', 'Madison',
    '2026-09-29 11:40:00+08', '2026-09-29 12:00:00+08', 1878, 1888, 10, 'Check in', 'Completed', v_org_id
  );

  v_request_id := 'eaad9b88-bb25-4855-8df6-a2b2738af30a';
  insert into public.transport_requests (
    id, mission_id, requester_type, requested_by, guest_name, pax_count, booking_type,
    pickup_location, destination, schedule_date, schedule_time,
    assigned_driver_id, assigned_driver_name, vehicle_id, vehicle_plate, department,
    special_notes, status, organization_id
  ) values (
    v_request_id, 'VANLOG-20260929-16', 'Errand', 'Sir Rex & Kenneth', 'Sir Rex & Kenneth', 1, 'Errand',
    'Madison', 'Labangon', '2026-09-29', '13:30',
    v_driver_id, v_driver_name, v_vehicle_id, v_vehicle_plate, null,
    'Imported from physical van log: Meeting', 'Completed', v_org_id
  );
  insert into public.mileage_logs (
    id, request_id, mission_id, driver_id, driver_name, vehicle_plate, guest_name,
    requester_type, department, pax_count, booking_type, pickup_location, destination,
    time_out, time_in, start_odometer, end_odometer, distance, remarks, status, organization_id
  ) values (
    (gen_random_uuid())::text, v_request_id, 'VANLOG-20260929-16', v_driver_id, v_driver_name, v_vehicle_plate, 'Sir Rex & Kenneth',
    'Errand', null, 1, 'Errand', 'Madison', 'Labangon',
    '2026-09-29 13:30:00+08', '2026-09-29 14:15:00+08', 1888, 1922, 34, null, 'Completed', v_org_id
  );

  v_request_id := 'dfb1c3a7-27f6-4d25-836e-9c979928d350';
  insert into public.transport_requests (
    id, mission_id, requester_type, requested_by, guest_name, pax_count, booking_type,
    pickup_location, destination, schedule_date, schedule_time,
    assigned_driver_id, assigned_driver_name, vehicle_id, vehicle_plate, department,
    special_notes, status, organization_id
  ) values (
    v_request_id, 'VANLOG-20260929-17', 'Guest', 'Hotel Guest', 'Hotel Guest', 1, 'Drop-off',
    'Madison', 'Airport', '2026-09-29', '16:00',
    v_driver_id, v_driver_name, v_vehicle_id, v_vehicle_plate, null,
    'Imported from physical van log: Check out', 'Completed', v_org_id
  );
  insert into public.mileage_logs (
    id, request_id, mission_id, driver_id, driver_name, vehicle_plate, guest_name,
    requester_type, department, pax_count, booking_type, pickup_location, destination,
    time_out, time_in, start_odometer, end_odometer, distance, remarks, status, organization_id
  ) values (
    (gen_random_uuid())::text, v_request_id, 'VANLOG-20260929-17', v_driver_id, v_driver_name, v_vehicle_plate, 'Hotel Guest',
    'Guest', null, 1, 'Drop-off', 'Madison', 'Airport',
    '2026-09-29 16:00:00+08', '2026-09-29 16:40:00+08', 1922, 1935, 13, 'Check out', 'Completed', v_org_id
  );

  v_request_id := 'baca6463-9373-4b03-ab4e-1b4a100e8e2e';
  insert into public.transport_requests (
    id, mission_id, requester_type, requested_by, guest_name, pax_count, booking_type,
    pickup_location, destination, schedule_date, schedule_time,
    assigned_driver_id, assigned_driver_name, vehicle_id, vehicle_plate, department,
    special_notes, status, organization_id
  ) values (
    v_request_id, 'VANLOG-20260929-18', 'Errand', 'Sir Rex & Kenneth', 'Sir Rex & Kenneth', 1, 'Errand',
    'Labangon', 'Madison', '2026-09-29', '17:10',
    v_driver_id, v_driver_name, v_vehicle_id, v_vehicle_plate, null,
    'Imported from physical van log: Meeting', 'Completed', v_org_id
  );
  insert into public.mileage_logs (
    id, request_id, mission_id, driver_id, driver_name, vehicle_plate, guest_name,
    requester_type, department, pax_count, booking_type, pickup_location, destination,
    time_out, time_in, start_odometer, end_odometer, distance, remarks, status, organization_id
  ) values (
    (gen_random_uuid())::text, v_request_id, 'VANLOG-20260929-18', v_driver_id, v_driver_name, v_vehicle_plate, 'Sir Rex & Kenneth',
    'Errand', null, 1, 'Errand', 'Labangon', 'Madison',
    '2026-09-29 17:10:00+08', '2026-09-29 19:49:00+08', 1935, 1975, 40, null, 'Completed', v_org_id
  );

  v_request_id := '0a9f114a-83d2-4936-81cf-6e0e1482310a';
  insert into public.transport_requests (
    id, mission_id, requester_type, requested_by, guest_name, pax_count, booking_type,
    pickup_location, destination, schedule_date, schedule_time,
    assigned_driver_id, assigned_driver_name, vehicle_id, vehicle_plate, department,
    special_notes, status, organization_id
  ) values (
    v_request_id, 'VANLOG-20260930-19', 'Guest', 'Hotel Guest', 'Hotel Guest', 1, 'Drop-off',
    'Madison', 'Airport', '2026-09-30', '08:00',
    v_driver_id, v_driver_name, v_vehicle_id, v_vehicle_plate, null,
    'Imported from physical van log: Check out', 'Completed', v_org_id
  );
  insert into public.mileage_logs (
    id, request_id, mission_id, driver_id, driver_name, vehicle_plate, guest_name,
    requester_type, department, pax_count, booking_type, pickup_location, destination,
    time_out, time_in, start_odometer, end_odometer, distance, remarks, status, organization_id
  ) values (
    (gen_random_uuid())::text, v_request_id, 'VANLOG-20260930-19', v_driver_id, v_driver_name, v_vehicle_plate, 'Hotel Guest',
    'Guest', null, 1, 'Drop-off', 'Madison', 'Airport',
    '2026-09-30 08:00:00+08', '2026-09-30 09:11:00+08', 1975, 1993, 18, null, 'Completed', v_org_id
  );

end $$;

-- VERIFY:
--   select mission_id, schedule_date, pickup_location, destination, status
--   from public.transport_requests where mission_id like 'VANLOG-%' order by schedule_date;
--   -- expect 19 rows
--   select mission_id, start_odometer, end_odometer, distance
--   from public.mileage_logs where mission_id like 'VANLOG-%' order by start_odometer;
--   -- expect the chain 1543->1595->1607->...->1993, with one real gap 1779->1866
