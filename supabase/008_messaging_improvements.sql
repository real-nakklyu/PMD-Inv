-- PMDInv messaging polish: one direct thread per staff pair and per-user conversation deletion.
-- Run after 007_staff_messaging.sql.

alter table public.message_threads
add column if not exists direct_key text;

alter table public.message_thread_members
add column if not exists deleted_at timestamptz;

create unique index if not exists message_threads_direct_key_unique_idx
on public.message_threads(direct_key)
where direct_key is not null and archived_at is null;

create index if not exists message_thread_members_visible_user_idx
on public.message_thread_members(user_id, deleted_at, created_at desc);

select 'PMDInv messaging improvements created' as status;
