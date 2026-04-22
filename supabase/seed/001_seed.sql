insert into public.patients (id, full_name, date_of_birth, region, created_at)
values
  ('10000000-0000-0000-0000-000000000001', 'Marisol Alvarez', '1952-04-18', 'Miami', now() - interval '80 days'),
  ('10000000-0000-0000-0000-000000000002', 'James Whitaker', '1947-10-02', 'Tampa', now() - interval '78 days'),
  ('10000000-0000-0000-0000-000000000003', 'Diane Porter', '1961-01-22', 'Orlando', now() - interval '61 days'),
  ('10000000-0000-0000-0000-000000000004', 'Robert Chen', '1958-07-09', 'Jacksonville', now() - interval '54 days'),
  ('10000000-0000-0000-0000-000000000005', 'Linda Morales', '1949-12-12', 'Fort Myers', now() - interval '40 days'),
  ('10000000-0000-0000-0000-000000000006', 'Evelyn Sanders', '1955-09-30', 'Sarasota', now() - interval '35 days'),
  ('10000000-0000-0000-0000-000000000007', 'Henry Lawson', '1944-03-03', 'Tallahassee', now() - interval '25 days'),
  ('10000000-0000-0000-0000-000000000008', 'Patricia Ruiz', '1959-06-14', 'Destin', now() - interval '20 days'),
  ('10000000-0000-0000-0000-000000000009', 'Calvin Brooks', '1950-08-21', 'Gainesville', now() - interval '12 days')
on conflict (id) do nothing;

insert into public.equipment (
  id, equipment_type, make, model, serial_number, bought_price, status, region, added_at, assigned_at, notes
)
values
  ('20000000-0000-0000-0000-000000000001', 'power_wheelchair', 'Permobil', 'M3 Corpus', 'PMB-M3-24001', 7350.00, 'assigned', 'Miami', now() - interval '90 days', now() - interval '52 days', 'Group 3 chair with tilt'),
  ('20000000-0000-0000-0000-000000000002', 'scooter', 'Pride Mobility', 'Go-Go Elite Traveller', 'PRD-GG-24002', 1280.00, 'available', 'Tampa', now() - interval '87 days', null, 'Fresh battery set installed'),
  ('20000000-0000-0000-0000-000000000003', 'power_wheelchair', 'Quantum', 'Q6 Edge 3', 'QTM-Q6-24003', 6925.00, 'in_repair', 'Orlando', now() - interval '83 days', null, 'Joystick fault under diagnosis'),
  ('20000000-0000-0000-0000-000000000004', 'scooter', 'Golden Technologies', 'Buzzaround EX', 'GLD-BZ-24004', 1495.00, 'return_in_progress', 'Jacksonville', now() - interval '76 days', now() - interval '46 days', 'Return pickup scheduled'),
  ('20000000-0000-0000-0000-000000000005', 'power_wheelchair', 'Drive Medical', 'Titan AXS', 'DRV-TN-24005', 4280.00, 'assigned', 'Fort Myers', now() - interval '68 days', now() - interval '44 days', null),
  ('20000000-0000-0000-0000-000000000006', 'scooter', 'Pride Mobility', 'Victory LX Sport', 'PRD-VL-24006', 2140.00, 'available', 'Sarasota', now() - interval '51 days', null, 'Low-mileage demo unit'),
  ('20000000-0000-0000-0000-000000000007', 'power_wheelchair', 'Merits Health', 'Vision Super', 'MRT-VS-24007', 5125.00, 'retired', 'Tallahassee', now() - interval '210 days', null, 'Frame fatigue; retired from service'),
  ('20000000-0000-0000-0000-000000000008', 'scooter', 'Afikim', 'Afiscooter S4', 'AFK-S4-24008', 3890.00, 'assigned', 'Destin', now() - interval '43 days', now() - interval '19 days', null),
  ('20000000-0000-0000-0000-000000000009', 'power_wheelchair', 'Quantum', 'Stretto', 'QTM-ST-24009', 6225.00, 'available', 'Gainesville', now() - interval '18 days', null, 'Compact base'),
  ('20000000-0000-0000-0000-000000000010', 'scooter', 'Drive Medical', 'Phoenix HD 4', 'DRV-PH-24010', 1360.00, 'available', 'Miami', now() - interval '11 days', null, null)
on conflict (id) do nothing;

insert into public.assignments (id, equipment_id, patient_id, region, status, assigned_at, ended_at, notes)
values
  ('30000000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000001', 'Miami', 'active', now() - interval '52 days', null, 'Delivered to home'),
  ('30000000-0000-0000-0000-000000000002', '20000000-0000-0000-0000-000000000004', '10000000-0000-0000-0000-000000000004', 'Jacksonville', 'return_in_progress', now() - interval '46 days', null, 'Patient no longer needs scooter'),
  ('30000000-0000-0000-0000-000000000003', '20000000-0000-0000-0000-000000000005', '10000000-0000-0000-0000-000000000005', 'Fort Myers', 'active', now() - interval '44 days', null, 'Assigned after discharge'),
  ('30000000-0000-0000-0000-000000000004', '20000000-0000-0000-0000-000000000008', '10000000-0000-0000-0000-000000000008', 'Destin', 'active', now() - interval '19 days', null, 'Coastal route delivery'),
  ('30000000-0000-0000-0000-000000000005', '20000000-0000-0000-0000-000000000003', '10000000-0000-0000-0000-000000000003', 'Orlando', 'ended', now() - interval '73 days', now() - interval '25 days', 'Ended due to repair intake')
on conflict (id) do nothing;

insert into public.returns (
  id, equipment_id, patient_id, assignment_id, status, requested_at, scheduled_at, received_at, closed_at, pickup_address, notes
)
values
  ('40000000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-000000000004', '10000000-0000-0000-0000-000000000004', '30000000-0000-0000-0000-000000000002', 'scheduled', now() - interval '6 days', now() + interval '1 day', null, null, 'Jacksonville, FL', 'Pickup window confirmed'),
  ('40000000-0000-0000-0000-000000000002', '20000000-0000-0000-0000-000000000003', '10000000-0000-0000-0000-000000000003', '30000000-0000-0000-0000-000000000005', 'closed', now() - interval '27 days', now() - interval '25 days', now() - interval '24 days', now() - interval '23 days', 'Orlando, FL', 'Received and routed to repair bench')
on conflict (id) do nothing;

insert into public.service_tickets (
  id, equipment_id, patient_id, assignment_id, priority, status, issue_description, repair_notes, repair_completed, opened_at, updated_status_at, resolved_at, closed_at
)
values
  ('50000000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-000000000003', null, null, 'high', 'in_progress', 'Joystick intermittently fails to respond when turning left.', 'Controller diagnostics started. Replacement joystick ordered.', false, now() - interval '22 days', now() - interval '2 days', null, null),
  ('50000000-0000-0000-0000-000000000002', '20000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000001', '30000000-0000-0000-0000-000000000001', 'medium', 'closed', 'Seat tilt actuator making noise under load.', 'Lubricated pivot assembly and replaced actuator mounting bolt.', true, now() - interval '30 days', now() - interval '26 days', now() - interval '26 days', now() - interval '25 days'),
  ('50000000-0000-0000-0000-000000000003', '20000000-0000-0000-0000-000000000006', null, null, 'low', 'resolved', 'Routine pre-assignment inspection found weak headlight.', 'Replaced front LED assembly and verified charging system.', true, now() - interval '16 days', now() - interval '15 days', now() - interval '15 days', null),
  ('50000000-0000-0000-0000-000000000004', '20000000-0000-0000-0000-000000000008', '10000000-0000-0000-0000-000000000008', '30000000-0000-0000-0000-000000000004', 'medium', 'scheduled', 'Patient reports reduced range after charging overnight.', null, false, now() - interval '3 days', now() - interval '1 day', null, null)
on conflict (id) do nothing;

insert into public.service_ticket_updates (ticket_id, status, note, created_at)
values
  ('50000000-0000-0000-0000-000000000001', 'open', 'Ticket opened after Orlando intake.', now() - interval '22 days'),
  ('50000000-0000-0000-0000-000000000001', 'in_progress', 'Technician started controller diagnostics.', now() - interval '2 days'),
  ('50000000-0000-0000-0000-000000000002', 'closed', 'Repair completed and verified with load test.', now() - interval '25 days'),
  ('50000000-0000-0000-0000-000000000004', 'scheduled', 'Mobile technician scheduled for battery test.', now() - interval '1 day');

insert into public.activity_logs (event_type, equipment_id, patient_id, assignment_id, return_id, service_ticket_id, message, metadata, created_at)
values
  ('equipment_created', '20000000-0000-0000-0000-000000000001', null, null, null, null, 'Permobil M3 Corpus added to Miami inventory.', '{"region":"Miami"}', now() - interval '90 days'),
  ('patient_assigned', '20000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000001', '30000000-0000-0000-0000-000000000001', null, null, 'PMB-M3-24001 assigned to Marisol Alvarez.', '{}', now() - interval '52 days'),
  ('return_initiated', '20000000-0000-0000-0000-000000000004', '10000000-0000-0000-0000-000000000004', '30000000-0000-0000-0000-000000000002', '40000000-0000-0000-0000-000000000001', null, 'Return initiated for GLD-BZ-24004.', '{}', now() - interval '6 days'),
  ('service_ticket_created', '20000000-0000-0000-0000-000000000003', null, null, null, '50000000-0000-0000-0000-000000000001', 'Service ticket opened for joystick issue.', '{"priority":"high"}', now() - interval '22 days'),
  ('repair_completed', '20000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000001', '30000000-0000-0000-0000-000000000001', null, '50000000-0000-0000-0000-000000000002', 'Tilt actuator repair completed.', '{}', now() - interval '26 days');
