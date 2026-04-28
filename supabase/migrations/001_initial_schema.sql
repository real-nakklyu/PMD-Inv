create extension if not exists "pgcrypto";
create extension if not exists "uuid-ossp";

create type public.florida_region as enum (
  'Miami',
  'Fort Myers',
  'Sarasota',
  'Tampa',
  'Orlando',
  'Gainesville',
  'Jacksonville',
  'Tallahassee',
  'Destin'
);

create type public.app_role as enum (
  'admin',
  'dispatcher',
  'technician',
  'viewer'
);

create type public.equipment_type as enum (
  'power_wheelchair',
  'scooter'
);

create type public.equipment_status as enum (
  'available',
  'assigned',
  'return_in_progress',
  'in_repair',
  'retired'
);

create type public.assignment_status as enum (
  'active',
  'return_in_progress',
  'ended'
);

create type public.return_status as enum (
  'requested',
  'scheduled',
  'pickup_pending',
  'in_transit',
  'received',
  'inspected',
  'restocked',
  'closed',
  'cancelled'
);

create type public.service_ticket_status as enum (
  'open',
  'scheduled',
  'waiting_parts',
  'in_progress',
  'resolved',
  'closed',
  'cancelled'
);

create type public.service_priority as enum (
  'low',
  'medium',
  'high',
  'urgent'
);

create type public.activity_event_type as enum (
  'equipment_created',
  'equipment_edited',
  'patient_created',
  'patient_assigned',
  'assignment_ended',
  'return_initiated',
  'return_status_changed',
  'return_completed',
  'service_ticket_created',
  'service_ticket_status_changed',
  'repair_completed'
);

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  full_name text not null,
  role public.app_role not null default 'viewer',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.patients (
  id uuid primary key default gen_random_uuid(),
  full_name text not null,
  date_of_birth date not null,
  region public.florida_region not null,
  address_line1 text,
  address_line2 text,
  city text,
  state text not null default 'FL',
  postal_code text,
  notes text,
  created_by uuid references public.profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  archived_at timestamptz,
  constraint patients_full_name_length check (char_length(trim(full_name)) >= 2),
  constraint patients_state_length check (char_length(trim(state)) between 2 and 40)
);

create table public.equipment (
  id uuid primary key default gen_random_uuid(),
  equipment_type public.equipment_type not null,
  make text not null,
  model text not null,
  serial_number text not null,
  bought_price numeric(10,2) not null default 0 check (bought_price >= 0),
  status public.equipment_status not null default 'available',
  region public.florida_region not null,
  added_at timestamptz not null default now(),
  assigned_at timestamptz,
  notes text,
  created_by uuid references public.profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  archived_at timestamptz,
  constraint equipment_make_length check (char_length(trim(make)) >= 2),
  constraint equipment_model_length check (char_length(trim(model)) >= 1),
  constraint equipment_serial_length check (char_length(trim(serial_number)) >= 3)
);

create unique index equipment_serial_number_unique_idx
  on public.equipment (upper(serial_number))
  where archived_at is null;

create index equipment_region_status_idx on public.equipment(region, status);
create index equipment_type_status_idx on public.equipment(equipment_type, status);
create index equipment_search_idx on public.equipment using gin (
  to_tsvector('english', coalesce(make, '') || ' ' || coalesce(model, '') || ' ' || coalesce(serial_number, ''))
);

create table public.assignments (
  id uuid primary key default gen_random_uuid(),
  equipment_id uuid not null references public.equipment(id) on delete restrict,
  patient_id uuid not null references public.patients(id) on delete restrict,
  region public.florida_region not null,
  status public.assignment_status not null default 'active',
  assigned_at timestamptz not null default now(),
  ended_at timestamptz,
  notes text,
  created_by uuid references public.profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint assignment_end_after_start check (ended_at is null or ended_at >= assigned_at)
);

create unique index assignments_one_active_equipment_idx
  on public.assignments(equipment_id)
  where status in ('active', 'return_in_progress');

create index assignments_patient_idx on public.assignments(patient_id, assigned_at desc);
create index assignments_region_status_idx on public.assignments(region, status);

create table public.returns (
  id uuid primary key default gen_random_uuid(),
  equipment_id uuid not null references public.equipment(id) on delete restrict,
  patient_id uuid not null references public.patients(id) on delete restrict,
  assignment_id uuid references public.assignments(id) on delete set null,
  status public.return_status not null default 'requested',
  requested_at timestamptz not null default now(),
  scheduled_at timestamptz,
  received_at timestamptz,
  closed_at timestamptz,
  pickup_address text,
  notes text,
  created_by uuid references public.profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint return_received_before_closed check (closed_at is null or received_at is not null),
  constraint return_schedule_after_request check (scheduled_at is null or scheduled_at >= requested_at)
);

create index returns_equipment_idx on public.returns(equipment_id, requested_at desc);
create index returns_status_idx on public.returns(status, requested_at desc);
create index returns_open_idx on public.returns(status) where status not in ('closed', 'cancelled');

create table public.service_tickets (
  id uuid primary key default gen_random_uuid(),
  equipment_id uuid not null references public.equipment(id) on delete restrict,
  patient_id uuid references public.patients(id) on delete set null,
  assignment_id uuid references public.assignments(id) on delete set null,
  priority public.service_priority not null default 'medium',
  status public.service_ticket_status not null default 'open',
  issue_description text not null,
  repair_notes text,
  repair_completed boolean not null default false,
  opened_at timestamptz not null default now(),
  updated_status_at timestamptz not null default now(),
  resolved_at timestamptz,
  closed_at timestamptz,
  created_by uuid references public.profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint service_issue_description_length check (char_length(trim(issue_description)) >= 5),
  constraint service_repair_notes_required check (
    repair_completed = false or repair_notes is not null and char_length(trim(repair_notes)) >= 5
  ),
  constraint service_resolved_timestamp_required check (
    status not in ('resolved', 'closed') or resolved_at is not null
  )
);

create index service_tickets_equipment_idx on public.service_tickets(equipment_id, opened_at desc);
create index service_tickets_status_idx on public.service_tickets(status, opened_at desc);
create index service_tickets_open_idx on public.service_tickets(status) where status not in ('closed', 'cancelled');

create table public.service_ticket_updates (
  id uuid primary key default gen_random_uuid(),
  ticket_id uuid not null references public.service_tickets(id) on delete cascade,
  status public.service_ticket_status,
  note text not null,
  created_by uuid references public.profiles(id),
  created_at timestamptz not null default now(),
  constraint service_update_note_length check (char_length(trim(note)) >= 2)
);

create index service_ticket_updates_ticket_idx on public.service_ticket_updates(ticket_id, created_at desc);

create table public.activity_logs (
  id uuid primary key default gen_random_uuid(),
  event_type public.activity_event_type not null,
  actor_id uuid references public.profiles(id),
  equipment_id uuid references public.equipment(id) on delete set null,
  patient_id uuid references public.patients(id) on delete set null,
  assignment_id uuid references public.assignments(id) on delete set null,
  return_id uuid references public.returns(id) on delete set null,
  service_ticket_id uuid references public.service_tickets(id) on delete set null,
  message text not null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index activity_logs_created_idx on public.activity_logs(created_at desc);
create index activity_logs_equipment_idx on public.activity_logs(equipment_id, created_at desc);
create index activity_logs_patient_idx on public.activity_logs(patient_id, created_at desc);

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger profiles_set_updated_at
before update on public.profiles
for each row execute function public.set_updated_at();

create trigger patients_set_updated_at
before update on public.patients
for each row execute function public.set_updated_at();

create trigger equipment_set_updated_at
before update on public.equipment
for each row execute function public.set_updated_at();

create trigger assignments_set_updated_at
before update on public.assignments
for each row execute function public.set_updated_at();

create trigger returns_set_updated_at
before update on public.returns
for each row execute function public.set_updated_at();

create trigger service_tickets_set_updated_at
before update on public.service_tickets
for each row execute function public.set_updated_at();

create or replace function public.current_user_role()
returns public.app_role
language sql
stable
security definer
set search_path = public
as $$
  select role from public.profiles where id = auth.uid()
$$;

create or replace function public.has_role(allowed_roles public.app_role[])
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(public.current_user_role() = any(allowed_roles), false)
$$;

create or replace view public.equipment_repair_counts as
select
  equipment_id,
  count(*) filter (where repair_completed = true and status in ('resolved', 'closed'))::int as completed_repairs
from public.service_tickets
group by equipment_id;

alter table public.profiles enable row level security;
alter table public.patients enable row level security;
alter table public.equipment enable row level security;
alter table public.assignments enable row level security;
alter table public.returns enable row level security;
alter table public.service_tickets enable row level security;
alter table public.service_ticket_updates enable row level security;
alter table public.activity_logs enable row level security;

create policy "profiles can read own profile"
on public.profiles for select
to authenticated
using (id = auth.uid() or public.has_role(array['admin']::public.app_role[]));

create policy "admins manage profiles"
on public.profiles for all
to authenticated
using (public.has_role(array['admin']::public.app_role[]))
with check (public.has_role(array['admin']::public.app_role[]));

create policy "staff can read patients"
on public.patients for select
to authenticated
using (public.current_user_role() is not null);

create policy "ops manage patients"
on public.patients for all
to authenticated
using (public.has_role(array['admin','dispatcher']::public.app_role[]))
with check (public.has_role(array['admin','dispatcher']::public.app_role[]));

create policy "staff can read equipment"
on public.equipment for select
to authenticated
using (public.current_user_role() is not null);

create policy "ops manage equipment"
on public.equipment for all
to authenticated
using (public.has_role(array['admin','dispatcher']::public.app_role[]))
with check (public.has_role(array['admin','dispatcher']::public.app_role[]));

create policy "staff can read assignments"
on public.assignments for select
to authenticated
using (public.current_user_role() is not null);

create policy "ops manage assignments"
on public.assignments for all
to authenticated
using (public.has_role(array['admin','dispatcher']::public.app_role[]))
with check (public.has_role(array['admin','dispatcher']::public.app_role[]));

create policy "staff can read returns"
on public.returns for select
to authenticated
using (public.current_user_role() is not null);

create policy "ops manage returns"
on public.returns for all
to authenticated
using (public.has_role(array['admin','dispatcher']::public.app_role[]))
with check (public.has_role(array['admin','dispatcher']::public.app_role[]));

create policy "staff can read service tickets"
on public.service_tickets for select
to authenticated
using (public.current_user_role() is not null);

create policy "ops and techs manage service tickets"
on public.service_tickets for all
to authenticated
using (public.has_role(array['admin','dispatcher','technician']::public.app_role[]))
with check (public.has_role(array['admin','dispatcher','technician']::public.app_role[]));

create policy "staff can read service updates"
on public.service_ticket_updates for select
to authenticated
using (public.current_user_role() is not null);

create policy "ops and techs manage service updates"
on public.service_ticket_updates for all
to authenticated
using (public.has_role(array['admin','dispatcher','technician']::public.app_role[]))
with check (public.has_role(array['admin','dispatcher','technician']::public.app_role[]));

create policy "staff can read activity"
on public.activity_logs for select
to authenticated
using (public.current_user_role() is not null);

create policy "system staff can add activity"
on public.activity_logs for insert
to authenticated
with check (public.has_role(array['admin','dispatcher','technician']::public.app_role[]));

insert into storage.buckets (id, name, public)
values ('service-attachments', 'service-attachments', false)
on conflict (id) do nothing;

create policy "staff can read service attachments"
on storage.objects for select
to authenticated
using (
  bucket_id = 'service-attachments'
  and public.current_user_role() is not null
);

create policy "ops and techs can upload service attachments"
on storage.objects for insert
to authenticated
with check (
  bucket_id = 'service-attachments'
  and public.has_role(array['admin','dispatcher','technician']::public.app_role[])
);
