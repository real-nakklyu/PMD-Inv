-- PMDInv equipment movement ledger.
-- Run after 009_messaging_thread_summaries.sql.

do $$ begin
  create type public.equipment_movement_type as enum (
    'received_into_inventory',
    'warehouse_to_driver',
    'driver_to_patient',
    'patient_to_return',
    'return_to_warehouse',
    'warehouse_to_repair',
    'repair_to_warehouse',
    'region_transfer',
    'manual_adjustment',
    'retired'
  );
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.equipment_location_type as enum (
    'warehouse',
    'driver',
    'patient',
    'repair',
    'return_in_transit',
    'retired',
    'unknown'
  );
exception when duplicate_object then null; end $$;

do $$ begin
  alter type public.activity_event_type add value if not exists 'equipment_moved';
exception when undefined_object then null; end $$;

create table if not exists public.equipment_movements (
  id uuid primary key default gen_random_uuid(),
  equipment_id uuid not null references public.equipment(id) on delete restrict,
  movement_type public.equipment_movement_type not null,
  from_location_type public.equipment_location_type not null default 'unknown',
  from_location_label text,
  from_region public.florida_region,
  to_location_type public.equipment_location_type not null,
  to_location_label text,
  to_region public.florida_region,
  patient_id uuid references public.patients(id) on delete set null,
  assignment_id uuid references public.assignments(id) on delete set null,
  return_id uuid references public.returns(id) on delete set null,
  appointment_id uuid references public.operational_appointments(id) on delete set null,
  service_ticket_id uuid references public.service_tickets(id) on delete set null,
  moved_at timestamptz not null default now(),
  notes text,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint movement_labels_length check (
    (from_location_label is null or char_length(trim(from_location_label)) <= 160)
    and (to_location_label is null or char_length(trim(to_location_label)) <= 160)
  ),
  constraint movement_notes_length check (notes is null or char_length(notes) <= 2000)
);

create index if not exists equipment_movements_equipment_idx on public.equipment_movements(equipment_id, moved_at desc);
create index if not exists equipment_movements_patient_idx on public.equipment_movements(patient_id, moved_at desc);
create index if not exists equipment_movements_assignment_idx on public.equipment_movements(assignment_id, moved_at desc);
create index if not exists equipment_movements_return_idx on public.equipment_movements(return_id, moved_at desc);
create index if not exists equipment_movements_appointment_idx on public.equipment_movements(appointment_id, moved_at desc);
create index if not exists equipment_movements_type_idx on public.equipment_movements(movement_type, moved_at desc);
create index if not exists equipment_movements_region_idx on public.equipment_movements(to_region, moved_at desc);

drop trigger if exists equipment_movements_set_updated_at on public.equipment_movements;
create trigger equipment_movements_set_updated_at
before update on public.equipment_movements
for each row execute function public.set_updated_at();

alter table public.equipment_movements enable row level security;

drop policy if exists "staff can read equipment movements" on public.equipment_movements;
create policy "staff can read equipment movements" on public.equipment_movements
for select to authenticated using (public.current_user_role() is not null);

drop policy if exists "ops and techs create equipment movements" on public.equipment_movements;
create policy "ops and techs create equipment movements" on public.equipment_movements
for insert to authenticated
with check (public.has_role(array['admin','dispatcher','technician']::public.app_role[]));

drop policy if exists "admins can update equipment movements" on public.equipment_movements;
create policy "admins can update equipment movements" on public.equipment_movements
for update to authenticated
using (public.has_role(array['admin']::public.app_role[]))
with check (public.has_role(array['admin']::public.app_role[]));

select 'PMDInv equipment movement ledger created' as status;
