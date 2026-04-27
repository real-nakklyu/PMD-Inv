-- PMDInv operational handoff notes.
-- Run after 012_equipment_cost_ledger.sql.

do $$ begin
  create type public.handoff_note_type as enum (
    'dispatch',
    'driver',
    'repair',
    'inventory',
    'admin'
  );
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.handoff_note_status as enum (
    'open',
    'resolved',
    'archived'
  );
exception when duplicate_object then null; end $$;

do $$ begin
  alter type public.activity_event_type add value if not exists 'handoff_note_created';
  alter type public.activity_event_type add value if not exists 'handoff_note_resolved';
exception when undefined_object then null; end $$;

create table if not exists public.handoff_notes (
  id uuid primary key default gen_random_uuid(),
  note_type public.handoff_note_type not null default 'dispatch',
  status public.handoff_note_status not null default 'open',
  priority public.service_priority not null default 'medium',
  region public.florida_region,
  title text not null,
  body text not null,
  context_label text,
  equipment_id uuid references public.equipment(id) on delete set null,
  patient_id uuid references public.patients(id) on delete set null,
  appointment_id uuid references public.operational_appointments(id) on delete set null,
  service_ticket_id uuid references public.service_tickets(id) on delete set null,
  created_by uuid references public.profiles(id) on delete set null,
  resolved_by uuid references public.profiles(id) on delete set null,
  resolved_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint handoff_note_title_length check (char_length(trim(title)) between 2 and 160),
  constraint handoff_note_body_length check (char_length(trim(body)) between 2 and 4000),
  constraint handoff_note_context_length check (context_label is null or char_length(trim(context_label)) <= 240)
);

create index if not exists handoff_notes_status_idx on public.handoff_notes(status, updated_at desc);
create index if not exists handoff_notes_type_idx on public.handoff_notes(note_type, updated_at desc);
create index if not exists handoff_notes_region_idx on public.handoff_notes(region, updated_at desc);
create index if not exists handoff_notes_equipment_idx on public.handoff_notes(equipment_id, updated_at desc);
create index if not exists handoff_notes_patient_idx on public.handoff_notes(patient_id, updated_at desc);

drop trigger if exists handoff_notes_set_updated_at on public.handoff_notes;
create trigger handoff_notes_set_updated_at
before update on public.handoff_notes
for each row execute function public.set_updated_at();

alter table public.handoff_notes enable row level security;

drop policy if exists "staff can read handoff notes" on public.handoff_notes;
create policy "staff can read handoff notes" on public.handoff_notes
for select to authenticated using (public.current_user_role() is not null);

drop policy if exists "staff can create handoff notes" on public.handoff_notes;
create policy "staff can create handoff notes" on public.handoff_notes
for insert to authenticated
with check (public.current_user_role() is not null);

drop policy if exists "staff can update handoff notes" on public.handoff_notes;
create policy "staff can update handoff notes" on public.handoff_notes
for update to authenticated
using (public.current_user_role() is not null)
with check (public.current_user_role() is not null);

drop policy if exists "admins delete handoff notes" on public.handoff_notes;
create policy "admins delete handoff notes" on public.handoff_notes
for delete to authenticated using (public.has_role(array['admin']::public.app_role[]));

select 'PMDInv handoff notes created' as status;
