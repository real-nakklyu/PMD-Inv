do $$ begin
  create type public.app_role as enum (
    'admin',
    'dispatcher',
    'technician',
    'viewer'
  );
exception when duplicate_object then null; end $$;

create table if not exists public.staff_access_requests (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  email text not null,
  full_name text not null check (length(trim(full_name)) >= 2),
  requested_role public.app_role not null default 'viewer',
  message text,
  status text not null default 'pending' check (status in ('pending', 'approved', 'denied')),
  reviewed_by uuid references public.profiles(id),
  reviewed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id)
);

create index if not exists staff_access_requests_status_idx on public.staff_access_requests(status);
create index if not exists staff_access_requests_created_at_idx on public.staff_access_requests(created_at desc);

drop trigger if exists staff_access_requests_set_updated_at on public.staff_access_requests;
create trigger staff_access_requests_set_updated_at
before update on public.staff_access_requests
for each row execute function public.set_updated_at();

alter table public.staff_access_requests enable row level security;

drop policy if exists "users can read own access request" on public.staff_access_requests;
create policy "users can read own access request"
on public.staff_access_requests for select
using (auth.uid() = user_id or public.current_user_role() = 'admin');

drop policy if exists "users can create own access request" on public.staff_access_requests;
create policy "users can create own access request"
on public.staff_access_requests for insert
with check (auth.uid() = user_id);

drop policy if exists "admins manage access requests" on public.staff_access_requests;
create policy "admins manage access requests"
on public.staff_access_requests for update
using (public.current_user_role() = 'admin')
with check (public.current_user_role() = 'admin');
