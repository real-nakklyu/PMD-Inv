-- Run after 014_warehouse_mode.sql.

alter table public.patients
add column if not exists address_line1 text,
add column if not exists address_line2 text,
add column if not exists city text,
add column if not exists state text not null default 'FL',
add column if not exists postal_code text,
add column if not exists notes text;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'patients_state_length'
      and conrelid = 'public.patients'::regclass
  ) then
    alter table public.patients
    add constraint patients_state_length check (char_length(trim(state)) between 2 and 40);
  end if;
end $$;

select 'PMDInv patient address and notes fields created' as status;
