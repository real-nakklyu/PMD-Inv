-- PMDInv delivery/signature and audit-diff expansion.
-- Run after 004_operations_expansion.sql.

do $$ begin
  alter type public.activity_event_type add value if not exists 'patient_edited';
  alter type public.activity_event_type add value if not exists 'delivery_setup_completed';
exception when undefined_object then null; end $$;

create table if not exists public.delivery_setup_checklists (
  id uuid primary key default gen_random_uuid(),
  appointment_id uuid references public.operational_appointments(id) on delete set null,
  assignment_id uuid references public.assignments(id) on delete set null,
  equipment_id uuid not null references public.equipment(id) on delete restrict,
  patient_id uuid not null references public.patients(id) on delete restrict,
  region public.florida_region not null,
  delivered boolean not null default false,
  setup_completed boolean not null default false,
  patient_or_caregiver_instructed boolean not null default false,
  safe_operation_reviewed boolean not null default false,
  troubleshooting_reviewed boolean not null default false,
  cleaning_reviewed boolean not null default false,
  maintenance_reviewed boolean not null default false,
  charger_confirmed boolean not null default false,
  battery_charged boolean not null default false,
  documents_left boolean not null default false,
  signature_name text,
  signature_data_url text,
  signed_at timestamptz,
  notes text,
  created_by uuid references public.profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint signature_name_length check (signature_name is null or char_length(trim(signature_name)) >= 2),
  constraint signature_required_when_signed check ((signature_data_url is null and signed_at is null) or signature_name is not null)
);

create index if not exists delivery_setup_checklists_appointment_idx on public.delivery_setup_checklists(appointment_id);
create index if not exists delivery_setup_checklists_equipment_idx on public.delivery_setup_checklists(equipment_id, created_at desc);
create index if not exists delivery_setup_checklists_patient_idx on public.delivery_setup_checklists(patient_id, created_at desc);

drop trigger if exists delivery_setup_checklists_set_updated_at on public.delivery_setup_checklists;
create trigger delivery_setup_checklists_set_updated_at
before update on public.delivery_setup_checklists
for each row execute function public.set_updated_at();

alter table public.delivery_setup_checklists enable row level security;

drop policy if exists "staff can read delivery setup checklists" on public.delivery_setup_checklists;
create policy "staff can read delivery setup checklists" on public.delivery_setup_checklists
for select to authenticated using (public.current_user_role() is not null);

drop policy if exists "ops and techs manage delivery setup checklists" on public.delivery_setup_checklists;
create policy "ops and techs manage delivery setup checklists" on public.delivery_setup_checklists
for all to authenticated
using (public.has_role(array['admin','dispatcher','technician']::public.app_role[]))
with check (public.has_role(array['admin','dispatcher','technician']::public.app_role[]));

select 'PMDInv delivery labels audit expansion created' as status;
