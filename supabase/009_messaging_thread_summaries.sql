-- PMDInv messaging performance: summarize visible threads in one query.
-- Run after 008_messaging_improvements.sql.

create or replace function public.list_message_threads(requesting_user_id uuid)
returns table (
  id uuid,
  thread_type public.message_thread_type,
  title text,
  created_by uuid,
  created_at timestamptz,
  updated_at timestamptz,
  archived_at timestamptz,
  members jsonb,
  latest_message jsonb,
  unread_count integer
)
language sql
stable
as $$
  with visible_memberships as (
    select mtm.*
    from public.message_thread_members mtm
    where mtm.user_id = requesting_user_id
      and mtm.deleted_at is null
  )
  select
    thread.id,
    thread.thread_type,
    thread.title,
    thread.created_by,
    thread.created_at,
    thread.updated_at,
    thread.archived_at,
    coalesce(members.members, '[]'::jsonb) as members,
    latest.latest_message,
    coalesce(unread.unread_count, 0)::int as unread_count
  from visible_memberships membership
  join public.message_threads thread on thread.id = membership.thread_id
  left join lateral (
    select jsonb_agg(
      jsonb_build_object(
        'id', member.id,
        'thread_id', member.thread_id,
        'user_id', member.user_id,
        'last_read_at', member.last_read_at,
        'created_at', member.created_at,
        'profile',
          case
            when profile.id is null then null
            else jsonb_build_object(
              'id', profile.id,
              'full_name', profile.full_name,
              'role', profile.role
            )
          end
      )
      order by member.created_at
    ) as members
    from public.message_thread_members member
    left join public.profiles profile on profile.id = member.user_id
    where member.thread_id = thread.id
  ) members on true
  left join lateral (
    select jsonb_build_object(
      'id', message.id,
      'thread_id', message.thread_id,
      'sender_id', message.sender_id,
      'body', message.body,
      'created_at', message.created_at,
      'updated_at', message.updated_at,
      'deleted_at', message.deleted_at,
      'sender',
        case
          when sender.id is null then null
          else jsonb_build_object(
            'id', sender.id,
            'full_name', sender.full_name,
            'role', sender.role
          )
        end,
      'attachments', '[]'::jsonb,
      'is_mine', message.sender_id = requesting_user_id
    ) as latest_message
    from public.messages message
    left join public.profiles sender on sender.id = message.sender_id
    where message.thread_id = thread.id
    order by message.created_at desc
    limit 1
  ) latest on true
  left join lateral (
    select count(*)::int as unread_count
    from public.messages message
    where message.thread_id = thread.id
      and message.sender_id <> requesting_user_id
      and (membership.last_read_at is null or message.created_at > membership.last_read_at)
  ) unread on true
  order by coalesce((latest.latest_message ->> 'created_at')::timestamptz, thread.updated_at) desc;
$$;

grant execute on function public.list_message_threads(uuid) to authenticated, service_role;

select 'PMDInv messaging thread summary function created' as status;
