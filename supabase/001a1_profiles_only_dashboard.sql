-- PMDInv profiles table only.
-- Run after 001a0_types_only_dashboard.sql and before 001a_core_schema_dashboard.sql
-- if Supabase reports: relation "public.profiles" does not exist.

create extension if not exists "pgcrypto";
create extension if not exists "uuid-ossp";

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  full_name text not null,
  role public.app_role not null default 'viewer',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

select 'PMDInv profiles table created' as status;
