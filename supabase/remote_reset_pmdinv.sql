-- PMDInv remote reset helper for Supabase SQL Editor.
-- This removes only PMDInv-created public objects and storage policies.
-- It does not delete Supabase Auth users.
-- Supabase blocks direct deletes from storage.objects/storage.buckets in SQL Editor,
-- so the service-attachments bucket is intentionally left in place.

drop policy if exists "staff can read service attachments" on storage.objects;
drop policy if exists "ops and techs can upload service attachments" on storage.objects;

drop view if exists public.equipment_repair_counts cascade;

drop table if exists public.activity_logs cascade;
drop table if exists public.service_ticket_updates cascade;
drop table if exists public.service_tickets cascade;
drop table if exists public.returns cascade;
drop table if exists public.assignments cascade;
drop table if exists public.equipment cascade;
drop table if exists public.patients cascade;
drop table if exists public.profiles cascade;

drop function if exists public.current_user_role() cascade;
drop function if exists public.has_role(public.app_role[]) cascade;
drop function if exists public.set_updated_at() cascade;

drop type if exists public.activity_event_type cascade;
drop type if exists public.service_priority cascade;
drop type if exists public.service_ticket_status cascade;
drop type if exists public.return_status cascade;
drop type if exists public.assignment_status cascade;
drop type if exists public.equipment_status cascade;
drop type if exists public.equipment_type cascade;
drop type if exists public.app_role cascade;
drop type if exists public.florida_region cascade;
