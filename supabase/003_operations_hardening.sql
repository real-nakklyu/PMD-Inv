alter table public.service_tickets
add column if not exists ticket_number text unique;

create table if not exists public.return_inspections (
  id uuid primary key default gen_random_uuid(),
  return_id uuid not null unique references public.returns(id) on delete cascade,
  equipment_id uuid not null references public.equipment(id) on delete cascade,
  cleaned boolean not null default false,
  sanitized boolean not null default false,
  battery_tested boolean not null default false,
  charger_verified boolean not null default false,
  damage_found boolean not null default false,
  repair_ticket_created boolean not null default false,
  approved_for_restock boolean not null default false,
  notes text,
  completed_by uuid references public.profiles(id),
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists return_inspections_return_id_idx on public.return_inspections(return_id);
create index if not exists return_inspections_equipment_id_idx on public.return_inspections(equipment_id);

drop trigger if exists return_inspections_set_updated_at on public.return_inspections;
create trigger return_inspections_set_updated_at
before update on public.return_inspections
for each row execute function public.set_updated_at();

alter table public.return_inspections enable row level security;

drop policy if exists "staff can read return inspections" on public.return_inspections;
create policy "staff can read return inspections"
on public.return_inspections for select
using (public.current_user_role() is not null);

drop policy if exists "ops can manage return inspections" on public.return_inspections;
create policy "ops can manage return inspections"
on public.return_inspections for all
using (public.current_user_role() in ('admin', 'dispatcher', 'technician'))
with check (public.current_user_role() in ('admin', 'dispatcher', 'technician'));
