-- PMDInv preventive maintenance and inspection tracking.
-- Run after 010_equipment_movement_ledger.sql.

do $$ begin
  create type public.maintenance_task_status as enum (
    'due',
    'scheduled',
    'completed',
    'skipped',
    'cancelled'
  );
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.maintenance_task_type as enum (
    'battery_check',
    'charger_check',
    'safety_inspection',
    'cleaning_sanitization',
    'tire_brake_check',
    'annual_pm',
    'other'
  );
exception when duplicate_object then null; end $$;

do $$ begin
  alter type public.activity_event_type add value if not exists 'maintenance_created';
  alter type public.activity_event_type add value if not exists 'maintenance_completed';
  alter type public.activity_event_type add value if not exists 'maintenance_status_changed';
exception when undefined_object then null; end $$;

create table if not exists public.preventive_maintenance_tasks (
  id uuid primary key default gen_random_uuid(),
  equipment_id uuid not null references public.equipment(id) on delete restrict,
  service_ticket_id uuid references public.service_tickets(id) on delete set null,
  task_type public.maintenance_task_type not null,
  status public.maintenance_task_status not null default 'due',
  priority public.service_priority not null default 'medium',
  due_at timestamptz not null,
  scheduled_at timestamptz,
  completed_at timestamptz,
  odometer_hours numeric(10, 1),
  battery_voltage numeric(5, 2),
  notes text,
  completion_notes text,
  created_by uuid references public.profiles(id) on delete set null,
  completed_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint maintenance_notes_length check (
    (notes is null or char_length(notes) <= 2000)
    and (completion_notes is null or char_length(completion_notes) <= 4000)
  ),
  constraint maintenance_completion_consistency check (
    (status = 'completed' and completed_at is not null)
    or (status <> 'completed')
  )
);

create index if not exists preventive_maintenance_equipment_idx on public.preventive_maintenance_tasks(equipment_id, due_at desc);
create index if not exists preventive_maintenance_status_idx on public.preventive_maintenance_tasks(status, due_at);
create index if not exists preventive_maintenance_due_idx on public.preventive_maintenance_tasks(due_at);
create index if not exists preventive_maintenance_type_idx on public.preventive_maintenance_tasks(task_type, due_at desc);

drop trigger if exists preventive_maintenance_set_updated_at on public.preventive_maintenance_tasks;
create trigger preventive_maintenance_set_updated_at
before update on public.preventive_maintenance_tasks
for each row execute function public.set_updated_at();

alter table public.preventive_maintenance_tasks enable row level security;

drop policy if exists "staff can read preventive maintenance" on public.preventive_maintenance_tasks;
create policy "staff can read preventive maintenance" on public.preventive_maintenance_tasks
for select to authenticated using (public.current_user_role() is not null);

drop policy if exists "ops and techs create preventive maintenance" on public.preventive_maintenance_tasks;
create policy "ops and techs create preventive maintenance" on public.preventive_maintenance_tasks
for insert to authenticated
with check (public.has_role(array['admin','dispatcher','technician']::public.app_role[]));

drop policy if exists "ops and techs update preventive maintenance" on public.preventive_maintenance_tasks;
create policy "ops and techs update preventive maintenance" on public.preventive_maintenance_tasks
for update to authenticated
using (public.has_role(array['admin','dispatcher','technician']::public.app_role[]))
with check (public.has_role(array['admin','dispatcher','technician']::public.app_role[]));

drop policy if exists "admins delete preventive maintenance" on public.preventive_maintenance_tasks;
create policy "admins delete preventive maintenance" on public.preventive_maintenance_tasks
for delete to authenticated using (public.has_role(array['admin']::public.app_role[]));

select 'PMDInv preventive maintenance tracking created' as status;
