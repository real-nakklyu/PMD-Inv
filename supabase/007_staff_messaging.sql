-- PMDInv staff messaging.
-- Run after 006_driver_and_assignment_constraints.sql.

do $$ begin
  create type public.message_thread_type as enum ('direct', 'group');
exception
  when duplicate_object then null;
end $$;

create table if not exists public.message_threads (
  id uuid primary key default gen_random_uuid(),
  thread_type public.message_thread_type not null default 'direct',
  title text,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  archived_at timestamptz,
  constraint message_threads_title_length check (title is null or char_length(trim(title)) >= 2)
);

create table if not exists public.message_thread_members (
  id uuid primary key default gen_random_uuid(),
  thread_id uuid not null references public.message_threads(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  last_read_at timestamptz,
  created_at timestamptz not null default now(),
  unique(thread_id, user_id)
);

create table if not exists public.messages (
  id uuid primary key default gen_random_uuid(),
  thread_id uuid not null references public.message_threads(id) on delete cascade,
  sender_id uuid not null references public.profiles(id) on delete cascade,
  body text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  constraint messages_body_or_attachment_ready check (char_length(body) <= 4000)
);

create table if not exists public.message_attachments (
  id uuid primary key default gen_random_uuid(),
  message_id uuid not null references public.messages(id) on delete cascade,
  bucket text not null default 'service-attachments',
  storage_path text not null,
  file_name text not null,
  mime_type text,
  file_size bigint,
  created_at timestamptz not null default now(),
  unique(bucket, storage_path)
);

create index if not exists message_thread_members_user_idx on public.message_thread_members(user_id, created_at desc);
create index if not exists message_thread_members_thread_idx on public.message_thread_members(thread_id);
create index if not exists messages_thread_created_idx on public.messages(thread_id, created_at desc);
create index if not exists messages_sender_idx on public.messages(sender_id, created_at desc);
create index if not exists message_attachments_message_idx on public.message_attachments(message_id);

drop trigger if exists message_threads_set_updated_at on public.message_threads;
create trigger message_threads_set_updated_at before update on public.message_threads for each row execute function public.set_updated_at();

drop trigger if exists messages_set_updated_at on public.messages;
create trigger messages_set_updated_at before update on public.messages for each row execute function public.set_updated_at();

alter table public.message_threads enable row level security;
alter table public.message_thread_members enable row level security;
alter table public.messages enable row level security;
alter table public.message_attachments enable row level security;

drop policy if exists "thread members can read message threads" on public.message_threads;
create policy "thread members can read message threads" on public.message_threads
for select to authenticated
using (
  exists (
    select 1 from public.message_thread_members mtm
    where mtm.thread_id = id and mtm.user_id = auth.uid()
  )
);

drop policy if exists "staff can create message threads" on public.message_threads;
create policy "staff can create message threads" on public.message_threads
for insert to authenticated
with check (public.current_user_role() is not null and created_by = auth.uid());

drop policy if exists "thread members can read memberships" on public.message_thread_members;
create policy "thread members can read memberships" on public.message_thread_members
for select to authenticated
using (
  exists (
    select 1 from public.message_thread_members mine
    where mine.thread_id = thread_id and mine.user_id = auth.uid()
  )
);

drop policy if exists "staff can create thread memberships" on public.message_thread_members;
create policy "staff can create thread memberships" on public.message_thread_members
for insert to authenticated
with check (public.current_user_role() is not null);

drop policy if exists "members update their own read state" on public.message_thread_members;
create policy "members update their own read state" on public.message_thread_members
for update to authenticated
using (user_id = auth.uid())
with check (user_id = auth.uid());

drop policy if exists "thread members can read messages" on public.messages;
create policy "thread members can read messages" on public.messages
for select to authenticated
using (
  exists (
    select 1 from public.message_thread_members mtm
    where mtm.thread_id = messages.thread_id and mtm.user_id = auth.uid()
  )
);

drop policy if exists "thread members can create messages" on public.messages;
create policy "thread members can create messages" on public.messages
for insert to authenticated
with check (
  sender_id = auth.uid()
  and exists (
    select 1 from public.message_thread_members mtm
    where mtm.thread_id = messages.thread_id and mtm.user_id = auth.uid()
  )
);

drop policy if exists "thread members can read message attachments" on public.message_attachments;
create policy "thread members can read message attachments" on public.message_attachments
for select to authenticated
using (
  exists (
    select 1
    from public.messages m
    join public.message_thread_members mtm on mtm.thread_id = m.thread_id
    where m.id = message_attachments.message_id and mtm.user_id = auth.uid()
  )
);

drop policy if exists "message senders can attach files" on public.message_attachments;
create policy "message senders can attach files" on public.message_attachments
for insert to authenticated
with check (
  exists (
    select 1 from public.messages m
    where m.id = message_attachments.message_id and m.sender_id = auth.uid()
  )
);

drop policy if exists "staff can upload message attachments" on storage.objects;
create policy "staff can upload message attachments" on storage.objects
for insert to authenticated
with check (
  bucket_id = 'service-attachments'
  and name like 'message/%'
  and public.current_user_role() is not null
);

select 'PMDInv staff messaging created' as status;
