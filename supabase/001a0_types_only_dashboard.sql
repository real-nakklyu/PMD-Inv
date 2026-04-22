-- PMDInv enum types only.
-- Run this before 001a_core_schema_dashboard.sql if Supabase says a public.* type does not exist.

do $$ begin
  create type public.florida_region as enum (
    'Miami',
    'Fort Myers',
    'Sarasota',
    'Tampa',
    'Orlando',
    'Gainesville',
    'Jacksonville',
    'Tallahassee',
    'Destin'
  );
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.app_role as enum (
    'admin',
    'dispatcher',
    'technician',
    'viewer'
  );
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.equipment_type as enum (
    'power_wheelchair',
    'scooter'
  );
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.equipment_status as enum (
    'available',
    'assigned',
    'return_in_progress',
    'in_repair',
    'retired'
  );
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.assignment_status as enum (
    'active',
    'return_in_progress',
    'ended'
  );
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.return_status as enum (
    'requested',
    'scheduled',
    'pickup_pending',
    'in_transit',
    'received',
    'inspected',
    'restocked',
    'closed',
    'cancelled'
  );
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.service_ticket_status as enum (
    'open',
    'scheduled',
    'waiting_parts',
    'in_progress',
    'resolved',
    'closed',
    'cancelled'
  );
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.service_priority as enum (
    'low',
    'medium',
    'high',
    'urgent'
  );
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.activity_event_type as enum (
    'equipment_created',
    'equipment_edited',
    'patient_created',
    'patient_assigned',
    'assignment_ended',
    'return_initiated',
    'return_status_changed',
    'return_completed',
    'service_ticket_created',
    'service_ticket_status_changed',
    'repair_completed'
  );
exception when duplicate_object then null; end $$;

select 'PMDInv enum types created' as status;
