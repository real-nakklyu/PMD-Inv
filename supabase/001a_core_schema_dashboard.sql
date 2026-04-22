-- PMDInv core schema for Supabase SQL Editor.
-- Run this after remote_reset_public_only.sql.
-- This creates only public schema objects: enums, tables, indexes, triggers, and repair-count view.

create extension if not exists "pgcrypto";
create extension if not exists "uuid-ossp";

do $$ begin
  create type public.florida_region as enum ('Miami','Fort Myers','Sarasota','Tampa','Orlando','Gainesville','Jacksonville','Tallahassee','Destin');
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.app_role as enum ('admin','dispatcher','technician','viewer');
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.equipment_type as enum ('power_wheelchair','scooter');
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.equipment_status as enum ('available','assigned','return_in_progress','in_repair','retired');
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.assignment_status as enum ('active','return_in_progress','ended');
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.return_status as enum ('requested','scheduled','pickup_pending','in_transit','received','inspected','restocked','closed','cancelled');
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.service_ticket_status as enum ('open','scheduled','waiting_parts','in_progress','resolved','closed','cancelled');
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.service_priority as enum ('low','medium','high','urgent');
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.activity_event_type as enum ('equipment_created','equipment_edited','patient_created','patient_assigned','assignment_ended','return_initiated','return_status_changed','return_completed','service_ticket_created','service_ticket_status_changed','repair_completed');
exception when duplicate_object then null; end $$;

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  full_name text not null,
  role public.app_role not null default 'viewer',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.patients (
  id uuid primary key default gen_random_uuid(),
  full_name text not null,
  date_of_birth date not null,
  region public.florida_region not null,
  created_by uuid references public.profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  archived_at timestamptz,
  constraint patients_full_name_length check (char_length(trim(full_name)) >= 2)
);

create table if not exists public.equipment (
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

create unique index if not exists equipment_serial_number_unique_idx on public.equipment (upper(serial_number)) where archived_at is null;
create index if not exists equipment_region_status_idx on public.equipment(region, status);
create index if not exists equipment_type_status_idx on public.equipment(equipment_type, status);
create index if not exists equipment_search_idx on public.equipment using gin (to_tsvector('english', coalesce(make, '') || ' ' || coalesce(model, '') || ' ' || coalesce(serial_number, '')));

create table if not exists public.assignments (
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

create unique index if not exists assignments_one_active_equipment_idx on public.assignments(equipment_id) where status in ('active', 'return_in_progress');
create index if not exists assignments_patient_idx on public.assignments(patient_id, assigned_at desc);
create index if not exists assignments_region_status_idx on public.assignments(region, status);

create table if not exists public.returns (
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

create index if not exists returns_equipment_idx on public.returns(equipment_id, requested_at desc);
create index if not exists returns_status_idx on public.returns(status, requested_at desc);
create index if not exists returns_open_idx on public.returns(status) where status not in ('closed', 'cancelled');

create table if not exists public.service_tickets (
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
  constraint service_repair_notes_required check (repair_completed = false or repair_notes is not null and char_length(trim(repair_notes)) >= 5),
  constraint service_resolved_timestamp_required check (status not in ('resolved', 'closed') or resolved_at is not null)
);

create index if not exists service_tickets_equipment_idx on public.service_tickets(equipment_id, opened_at desc);
create index if not exists service_tickets_status_idx on public.service_tickets(status, opened_at desc);
create index if not exists service_tickets_open_idx on public.service_tickets(status) where status not in ('closed', 'cancelled');

create table if not exists public.service_ticket_updates (
  id uuid primary key default gen_random_uuid(),
  ticket_id uuid not null references public.service_tickets(id) on delete cascade,
  status public.service_ticket_status,
  note text not null,
  created_by uuid references public.profiles(id),
  created_at timestamptz not null default now(),
  constraint service_update_note_length check (char_length(trim(note)) >= 2)
);

create index if not exists service_ticket_updates_ticket_idx on public.service_ticket_updates(ticket_id, created_at desc);

create table if not exists public.activity_logs (
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

create index if not exists activity_logs_created_idx on public.activity_logs(created_at desc);
create index if not exists activity_logs_equipment_idx on public.activity_logs(equipment_id, created_at desc);
create index if not exists activity_logs_patient_idx on public.activity_logs(patient_id, created_at desc);

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists profiles_set_updated_at on public.profiles;
create trigger profiles_set_updated_at before update on public.profiles for each row execute function public.set_updated_at();
drop trigger if exists patients_set_updated_at on public.patients;
create trigger patients_set_updated_at before update on public.patients for each row execute function public.set_updated_at();
drop trigger if exists equipment_set_updated_at on public.equipment;
create trigger equipment_set_updated_at before update on public.equipment for each row execute function public.set_updated_at();
drop trigger if exists assignments_set_updated_at on public.assignments;
create trigger assignments_set_updated_at before update on public.assignments for each row execute function public.set_updated_at();
drop trigger if exists returns_set_updated_at on public.returns;
create trigger returns_set_updated_at before update on public.returns for each row execute function public.set_updated_at();
drop trigger if exists service_tickets_set_updated_at on public.service_tickets;
create trigger service_tickets_set_updated_at before update on public.service_tickets for each row execute function public.set_updated_at();

create or replace view public.equipment_repair_counts as
select
  equipment_id,
  count(*) filter (where repair_completed = true and status in ('resolved', 'closed'))::int as completed_repairs
from public.service_tickets
group by equipment_id;

select 'PMDInv core schema created' as status;
