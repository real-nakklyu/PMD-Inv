-- PMDInv driver assignment and active patient-assignment guard.
-- Run after 005_delivery_labels_audit.sql.

alter table public.operational_appointments
add column if not exists driver_name text;

alter table public.operational_appointments
drop constraint if exists operational_appointments_driver_name_check;

alter table public.operational_appointments
add constraint operational_appointments_driver_name_check
check (
  driver_name is null
  or driver_name in (
    'Driver Miami',
    'Driver Fort Myers',
    'Driver Sarasota',
    'Driver Tampa',
    'Driver Orlando',
    'Driver Gainesville',
    'Driver Jacksonville',
    'Driver Tallahassee',
    'Driver Destin'
  )
);

create index if not exists assignments_active_patient_idx
on public.assignments(patient_id)
where status in ('active', 'return_in_progress');

select 'PMDInv driver assignment expansion created' as status;
