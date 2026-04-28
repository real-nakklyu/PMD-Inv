-- PMDInv RLS and storage setup for Supabase SQL Editor.
-- Run only after 001a_core_schema_dashboard.sql succeeds.

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

alter table public.profiles enable row level security;
alter table public.patients enable row level security;
alter table public.patient_notes enable row level security;
alter table public.equipment enable row level security;
alter table public.assignments enable row level security;
alter table public.returns enable row level security;
alter table public.service_tickets enable row level security;
alter table public.service_ticket_updates enable row level security;
alter table public.activity_logs enable row level security;

drop policy if exists "profiles can read own profile" on public.profiles;
create policy "profiles can read own profile" on public.profiles for select to authenticated using (id = auth.uid() or public.has_role(array['admin']::public.app_role[]));

drop policy if exists "admins manage profiles" on public.profiles;
create policy "admins manage profiles" on public.profiles for all to authenticated using (public.has_role(array['admin']::public.app_role[])) with check (public.has_role(array['admin']::public.app_role[]));

drop policy if exists "staff can read patients" on public.patients;
create policy "staff can read patients" on public.patients for select to authenticated using (public.current_user_role() is not null);

drop policy if exists "ops manage patients" on public.patients;
create policy "ops manage patients" on public.patients for all to authenticated using (public.has_role(array['admin','dispatcher']::public.app_role[])) with check (public.has_role(array['admin','dispatcher']::public.app_role[]));

drop policy if exists "staff can read patient notes" on public.patient_notes;
create policy "staff can read patient notes" on public.patient_notes for select to authenticated using (public.current_user_role() is not null);

drop policy if exists "staff can create patient notes" on public.patient_notes;
create policy "staff can create patient notes" on public.patient_notes for insert to authenticated with check (public.current_user_role() is not null);

drop policy if exists "admins can manage patient notes" on public.patient_notes;
create policy "admins can manage patient notes" on public.patient_notes for all to authenticated using (public.has_role(array['admin']::public.app_role[])) with check (public.has_role(array['admin']::public.app_role[]));

drop policy if exists "staff can read equipment" on public.equipment;
create policy "staff can read equipment" on public.equipment for select to authenticated using (public.current_user_role() is not null);

drop policy if exists "ops manage equipment" on public.equipment;
create policy "ops manage equipment" on public.equipment for all to authenticated using (public.has_role(array['admin','dispatcher']::public.app_role[])) with check (public.has_role(array['admin','dispatcher']::public.app_role[]));

drop policy if exists "staff can read assignments" on public.assignments;
create policy "staff can read assignments" on public.assignments for select to authenticated using (public.current_user_role() is not null);

drop policy if exists "ops manage assignments" on public.assignments;
create policy "ops manage assignments" on public.assignments for all to authenticated using (public.has_role(array['admin','dispatcher']::public.app_role[])) with check (public.has_role(array['admin','dispatcher']::public.app_role[]));

drop policy if exists "staff can read returns" on public.returns;
create policy "staff can read returns" on public.returns for select to authenticated using (public.current_user_role() is not null);

drop policy if exists "ops manage returns" on public.returns;
create policy "ops manage returns" on public.returns for all to authenticated using (public.has_role(array['admin','dispatcher']::public.app_role[])) with check (public.has_role(array['admin','dispatcher']::public.app_role[]));

drop policy if exists "staff can read service tickets" on public.service_tickets;
create policy "staff can read service tickets" on public.service_tickets for select to authenticated using (public.current_user_role() is not null);

drop policy if exists "ops and techs manage service tickets" on public.service_tickets;
create policy "ops and techs manage service tickets" on public.service_tickets for all to authenticated using (public.has_role(array['admin','dispatcher','technician']::public.app_role[])) with check (public.has_role(array['admin','dispatcher','technician']::public.app_role[]));

drop policy if exists "staff can read service updates" on public.service_ticket_updates;
create policy "staff can read service updates" on public.service_ticket_updates for select to authenticated using (public.current_user_role() is not null);

drop policy if exists "ops and techs manage service updates" on public.service_ticket_updates;
create policy "ops and techs manage service updates" on public.service_ticket_updates for all to authenticated using (public.has_role(array['admin','dispatcher','technician']::public.app_role[])) with check (public.has_role(array['admin','dispatcher','technician']::public.app_role[]));

drop policy if exists "staff can read activity" on public.activity_logs;
create policy "staff can read activity" on public.activity_logs for select to authenticated using (public.current_user_role() is not null);

drop policy if exists "system staff can add activity" on public.activity_logs;
create policy "system staff can add activity" on public.activity_logs for insert to authenticated with check (public.has_role(array['admin','dispatcher','technician']::public.app_role[]));

insert into storage.buckets (id, name, public)
values ('service-attachments', 'service-attachments', false)
on conflict (id) do nothing;

drop policy if exists "staff can read service attachments" on storage.objects;
create policy "staff can read service attachments" on storage.objects for select to authenticated using (bucket_id = 'service-attachments' and public.current_user_role() is not null);

drop policy if exists "ops and techs can upload service attachments" on storage.objects;
create policy "ops and techs can upload service attachments" on storage.objects for insert to authenticated with check (bucket_id = 'service-attachments' and public.has_role(array['admin','dispatcher','technician']::public.app_role[]));

select 'PMDInv RLS policies created' as status;
