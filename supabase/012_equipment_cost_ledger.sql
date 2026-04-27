-- PMDInv equipment cost and vendor ledger.
-- Run after 011_preventive_maintenance.sql.

do $$ begin
  create type public.equipment_cost_event_type as enum (
    'purchase',
    'repair_parts',
    'repair_labor',
    'transport',
    'maintenance',
    'warranty_credit',
    'adjustment'
  );
exception when duplicate_object then null; end $$;

do $$ begin
  alter type public.activity_event_type add value if not exists 'cost_event_created';
  alter type public.activity_event_type add value if not exists 'cost_event_deleted';
exception when undefined_object then null; end $$;

create table if not exists public.equipment_cost_events (
  id uuid primary key default gen_random_uuid(),
  equipment_id uuid not null references public.equipment(id) on delete restrict,
  service_ticket_id uuid references public.service_tickets(id) on delete set null,
  maintenance_task_id uuid references public.preventive_maintenance_tasks(id) on delete set null,
  event_type public.equipment_cost_event_type not null,
  amount numeric(12, 2) not null,
  vendor text,
  invoice_number text,
  occurred_at timestamptz not null default now(),
  notes text,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint equipment_cost_amount_not_zero check (amount <> 0),
  constraint equipment_cost_text_length check (
    (vendor is null or char_length(trim(vendor)) <= 160)
    and (invoice_number is null or char_length(trim(invoice_number)) <= 120)
    and (notes is null or char_length(notes) <= 2000)
  )
);

create index if not exists equipment_cost_events_equipment_idx on public.equipment_cost_events(equipment_id, occurred_at desc);
create index if not exists equipment_cost_events_service_ticket_idx on public.equipment_cost_events(service_ticket_id, occurred_at desc);
create index if not exists equipment_cost_events_type_idx on public.equipment_cost_events(event_type, occurred_at desc);
create index if not exists equipment_cost_events_vendor_idx on public.equipment_cost_events(vendor);
create index if not exists equipment_cost_events_occurred_idx on public.equipment_cost_events(occurred_at desc);

drop trigger if exists equipment_cost_events_set_updated_at on public.equipment_cost_events;
create trigger equipment_cost_events_set_updated_at
before update on public.equipment_cost_events
for each row execute function public.set_updated_at();

alter table public.equipment_cost_events enable row level security;

drop policy if exists "staff can read equipment cost events" on public.equipment_cost_events;
create policy "staff can read equipment cost events" on public.equipment_cost_events
for select to authenticated using (public.current_user_role() is not null);

drop policy if exists "ops can create equipment cost events" on public.equipment_cost_events;
create policy "ops can create equipment cost events" on public.equipment_cost_events
for insert to authenticated
with check (public.has_role(array['admin','dispatcher']::public.app_role[]));

drop policy if exists "admins can update equipment cost events" on public.equipment_cost_events;
create policy "admins can update equipment cost events" on public.equipment_cost_events
for update to authenticated
using (public.has_role(array['admin']::public.app_role[]))
with check (public.has_role(array['admin']::public.app_role[]));

drop policy if exists "admins can delete equipment cost events" on public.equipment_cost_events;
create policy "admins can delete equipment cost events" on public.equipment_cost_events
for delete to authenticated using (public.has_role(array['admin']::public.app_role[]));

select 'PMDInv equipment cost ledger created' as status;
