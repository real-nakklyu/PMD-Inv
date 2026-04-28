-- Run after 015_patient_address_notes.sql.

do $$ begin
  alter type public.activity_event_type add value if not exists 'patient_note_added';
exception when undefined_object then null; end $$;

create table if not exists public.patient_notes (
  id uuid primary key default gen_random_uuid(),
  patient_id uuid not null references public.patients(id) on delete cascade,
  body text not null,
  created_by uuid references public.profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint patient_notes_body_length check (char_length(trim(body)) between 2 and 4000)
);

create index if not exists patient_notes_patient_idx on public.patient_notes(patient_id, created_at desc);
create index if not exists patient_notes_created_by_idx on public.patient_notes(created_by, created_at desc);

drop trigger if exists patient_notes_set_updated_at on public.patient_notes;
create trigger patient_notes_set_updated_at
before update on public.patient_notes
for each row execute function public.set_updated_at();

alter table public.patient_notes enable row level security;

drop policy if exists "staff can read patient notes" on public.patient_notes;
create policy "staff can read patient notes" on public.patient_notes
for select to authenticated using (public.current_user_role() is not null);

drop policy if exists "staff can create patient notes" on public.patient_notes;
create policy "staff can create patient notes" on public.patient_notes
for insert to authenticated
with check (public.current_user_role() is not null);

drop policy if exists "admins can manage patient notes" on public.patient_notes;
create policy "admins can manage patient notes" on public.patient_notes
for all to authenticated
using (public.has_role(array['admin']::public.app_role[]))
with check (public.has_role(array['admin']::public.app_role[]));

select 'PMDInv patient note timeline created' as status;
