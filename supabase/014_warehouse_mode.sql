-- PMDInv warehouse mode: receiving, bin/shelf control, cycle counts, and redeploy readiness.
-- Run after 013_handoff_notes.sql.

do $$ begin
  create type public.warehouse_condition_grade as enum (
    'new',
    'ready',
    'good',
    'fair',
    'needs_repair',
    'hold',
    'retired'
  );
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.warehouse_readiness_status as enum (
    'ready',
    'needs_cleaning',
    'needs_battery',
    'needs_repair',
    'hold',
    'retired'
  );
exception when duplicate_object then null; end $$;

do $$ begin
  alter type public.activity_event_type add value if not exists 'warehouse_received';
  alter type public.activity_event_type add value if not exists 'warehouse_cycle_counted';
  alter type public.activity_event_type add value if not exists 'redeploy_checklist_completed';
exception when undefined_object then null; end $$;

create table if not exists public.warehouse_inventory_profiles (
  equipment_id uuid primary key references public.equipment(id) on delete cascade,
  region public.florida_region not null,
  bin_location text,
  shelf_location text,
  condition_grade public.warehouse_condition_grade not null default 'good',
  readiness_status public.warehouse_readiness_status not null default 'ready',
  last_received_at timestamptz,
  last_cycle_counted_at timestamptz,
  notes text,
  updated_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint warehouse_location_length check (
    (bin_location is null or char_length(trim(bin_location)) <= 80)
    and (shelf_location is null or char_length(trim(shelf_location)) <= 80)
    and (notes is null or char_length(notes) <= 2000)
  )
);

create table if not exists public.warehouse_cycle_count_sessions (
  id uuid primary key default gen_random_uuid(),
  region public.florida_region not null,
  bin_location text,
  shelf_location text,
  counted_at timestamptz not null default now(),
  notes text,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.warehouse_cycle_count_items (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references public.warehouse_cycle_count_sessions(id) on delete cascade,
  equipment_id uuid references public.equipment(id) on delete set null,
  serial_number text not null,
  expected_region public.florida_region,
  observed_region public.florida_region not null,
  observed_status public.equipment_status,
  condition_grade public.warehouse_condition_grade,
  found boolean not null default true,
  variance_note text,
  created_at timestamptz not null default now()
);

create table if not exists public.warehouse_redeploy_checklists (
  id uuid primary key default gen_random_uuid(),
  equipment_id uuid not null references public.equipment(id) on delete cascade,
  cleaned boolean not null default false,
  sanitized boolean not null default false,
  battery_checked boolean not null default false,
  charger_present boolean not null default false,
  physical_inspection_passed boolean not null default false,
  paperwork_ready boolean not null default false,
  approved_for_redeploy boolean not null default false,
  notes text,
  completed_by uuid references public.profiles(id) on delete set null,
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists warehouse_inventory_region_idx on public.warehouse_inventory_profiles(region, readiness_status, condition_grade);
create index if not exists warehouse_inventory_bin_idx on public.warehouse_inventory_profiles(region, bin_location, shelf_location);
create index if not exists warehouse_cycle_sessions_region_idx on public.warehouse_cycle_count_sessions(region, counted_at desc);
create index if not exists warehouse_cycle_items_session_idx on public.warehouse_cycle_count_items(session_id);
create index if not exists warehouse_cycle_items_serial_idx on public.warehouse_cycle_count_items(serial_number);
create index if not exists warehouse_redeploy_equipment_idx on public.warehouse_redeploy_checklists(equipment_id, created_at desc);

drop trigger if exists warehouse_inventory_profiles_set_updated_at on public.warehouse_inventory_profiles;
create trigger warehouse_inventory_profiles_set_updated_at
before update on public.warehouse_inventory_profiles
for each row execute function public.set_updated_at();

drop trigger if exists warehouse_cycle_count_sessions_set_updated_at on public.warehouse_cycle_count_sessions;
create trigger warehouse_cycle_count_sessions_set_updated_at
before update on public.warehouse_cycle_count_sessions
for each row execute function public.set_updated_at();

drop trigger if exists warehouse_redeploy_checklists_set_updated_at on public.warehouse_redeploy_checklists;
create trigger warehouse_redeploy_checklists_set_updated_at
before update on public.warehouse_redeploy_checklists
for each row execute function public.set_updated_at();

alter table public.warehouse_inventory_profiles enable row level security;
alter table public.warehouse_cycle_count_sessions enable row level security;
alter table public.warehouse_cycle_count_items enable row level security;
alter table public.warehouse_redeploy_checklists enable row level security;

drop policy if exists "staff can read warehouse profiles" on public.warehouse_inventory_profiles;
create policy "staff can read warehouse profiles" on public.warehouse_inventory_profiles
for select to authenticated using (public.current_user_role() is not null);

drop policy if exists "ops manage warehouse profiles" on public.warehouse_inventory_profiles;
create policy "ops manage warehouse profiles" on public.warehouse_inventory_profiles
for all to authenticated
using (public.has_role(array['admin','dispatcher','technician']::public.app_role[]))
with check (public.has_role(array['admin','dispatcher','technician']::public.app_role[]));

drop policy if exists "staff can read cycle count sessions" on public.warehouse_cycle_count_sessions;
create policy "staff can read cycle count sessions" on public.warehouse_cycle_count_sessions
for select to authenticated using (public.current_user_role() is not null);

drop policy if exists "ops manage cycle count sessions" on public.warehouse_cycle_count_sessions;
create policy "ops manage cycle count sessions" on public.warehouse_cycle_count_sessions
for all to authenticated
using (public.has_role(array['admin','dispatcher','technician']::public.app_role[]))
with check (public.has_role(array['admin','dispatcher','technician']::public.app_role[]));

drop policy if exists "staff can read cycle count items" on public.warehouse_cycle_count_items;
create policy "staff can read cycle count items" on public.warehouse_cycle_count_items
for select to authenticated using (public.current_user_role() is not null);

drop policy if exists "ops manage cycle count items" on public.warehouse_cycle_count_items;
create policy "ops manage cycle count items" on public.warehouse_cycle_count_items
for all to authenticated
using (public.has_role(array['admin','dispatcher','technician']::public.app_role[]))
with check (public.has_role(array['admin','dispatcher','technician']::public.app_role[]));

drop policy if exists "staff can read redeploy checklists" on public.warehouse_redeploy_checklists;
create policy "staff can read redeploy checklists" on public.warehouse_redeploy_checklists
for select to authenticated using (public.current_user_role() is not null);

drop policy if exists "ops manage redeploy checklists" on public.warehouse_redeploy_checklists;
create policy "ops manage redeploy checklists" on public.warehouse_redeploy_checklists
for all to authenticated
using (public.has_role(array['admin','dispatcher','technician']::public.app_role[]))
with check (public.has_role(array['admin','dispatcher','technician']::public.app_role[]));

select 'PMDInv warehouse mode created' as status;
