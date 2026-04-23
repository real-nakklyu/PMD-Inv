-- PMDInv operations expansion.
-- Adds scheduling, configurable low-availability thresholds, saved views, and richer activity event support.

do $$ begin
  alter type public.activity_event_type add value if not exists 'appointment_created';
  alter type public.activity_event_type add value if not exists 'appointment_status_changed';
  alter type public.activity_event_type add value if not exists 'threshold_changed';
exception when undefined_object then null; end $$;

create table if not exists public.operational_appointments (
  id uuid primary key default gen_random_uuid(),
  kind text not null check (kind in ('delivery','pickup','service','return','inspection')),
  status text not null default 'scheduled' check (status in ('scheduled','in_progress','completed','cancelled','no_show')),
  region public.florida_region not null,
  scheduled_start timestamptz not null,
  scheduled_end timestamptz,
  patient_id uuid references public.patients(id) on delete set null,
  equipment_id uuid references public.equipment(id) on delete set null,
  return_id uuid references public.returns(id) on delete set null,
  service_ticket_id uuid references public.service_tickets(id) on delete set null,
  assigned_to uuid references public.profiles(id) on delete set null,
  title text not null,
  location_note text,
  notes text,
  created_by uuid references public.profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint appointment_end_after_start check (scheduled_end is null or scheduled_end >= scheduled_start)
);

create index if not exists operational_appointments_region_start_idx on public.operational_appointments(region, scheduled_start);
create index if not exists operational_appointments_status_idx on public.operational_appointments(status, scheduled_start);
create index if not exists operational_appointments_equipment_idx on public.operational_appointments(equipment_id, scheduled_start desc);
create index if not exists operational_appointments_patient_idx on public.operational_appointments(patient_id, scheduled_start desc);

create table if not exists public.availability_thresholds (
  id uuid primary key default gen_random_uuid(),
  region public.florida_region not null,
  equipment_type public.equipment_type not null,
  minimum_available integer not null default 0 check (minimum_available >= 0 and minimum_available <= 1000),
  notes text,
  created_by uuid references public.profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(region, equipment_type)
);

create index if not exists availability_thresholds_region_type_idx on public.availability_thresholds(region, equipment_type);

create table if not exists public.saved_views (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  page text not null check (page in ('inventory','assigned','returns','service_tickets','patients','schedule','reports')),
  name text not null,
  filters jsonb not null default '{}'::jsonb,
  is_default boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint saved_views_name_length check (char_length(trim(name)) >= 2)
);

create index if not exists saved_views_user_page_idx on public.saved_views(user_id, page, created_at desc);

drop trigger if exists operational_appointments_set_updated_at on public.operational_appointments;
create trigger operational_appointments_set_updated_at
before update on public.operational_appointments
for each row execute function public.set_updated_at();

drop trigger if exists availability_thresholds_set_updated_at on public.availability_thresholds;
create trigger availability_thresholds_set_updated_at
before update on public.availability_thresholds
for each row execute function public.set_updated_at();

drop trigger if exists saved_views_set_updated_at on public.saved_views;
create trigger saved_views_set_updated_at
before update on public.saved_views
for each row execute function public.set_updated_at();

alter table public.operational_appointments enable row level security;
alter table public.availability_thresholds enable row level security;
alter table public.saved_views enable row level security;

drop policy if exists "staff can read appointments" on public.operational_appointments;
create policy "staff can read appointments" on public.operational_appointments
for select to authenticated using (public.current_user_role() is not null);

drop policy if exists "ops manage appointments" on public.operational_appointments;
create policy "ops manage appointments" on public.operational_appointments
for all to authenticated
using (public.has_role(array['admin','dispatcher','technician']::public.app_role[]))
with check (public.has_role(array['admin','dispatcher','technician']::public.app_role[]));

drop policy if exists "staff can read thresholds" on public.availability_thresholds;
create policy "staff can read thresholds" on public.availability_thresholds
for select to authenticated using (public.current_user_role() is not null);

drop policy if exists "admins manage thresholds" on public.availability_thresholds;
create policy "admins manage thresholds" on public.availability_thresholds
for all to authenticated
using (public.has_role(array['admin']::public.app_role[]))
with check (public.has_role(array['admin']::public.app_role[]));

drop policy if exists "staff manage own saved views" on public.saved_views;
create policy "staff manage own saved views" on public.saved_views
for all to authenticated
using (user_id = auth.uid() and public.current_user_role() is not null)
with check (user_id = auth.uid() and public.current_user_role() is not null);

select 'PMDInv operations expansion created' as status;
