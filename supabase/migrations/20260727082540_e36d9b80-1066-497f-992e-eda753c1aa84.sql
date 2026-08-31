
-- 1. Update signup trigger: remove whitelist enforcement
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  first_user boolean;
begin
  select count(*)=0 into first_user from auth.users where id <> new.id;

  insert into public.profiles(id, email, full_name)
  values (new.id, new.email, coalesce(new.raw_user_meta_data->>'full_name', new.email))
  on conflict (id) do nothing;

  if first_user then
    insert into public.user_roles(user_id, role) values (new.id, 'superadmin')
    on conflict do nothing;
  else
    insert into public.user_roles(user_id, role) values (new.id, 'customer')
    on conflict do nothing;
  end if;

  return new;
end;
$$;

-- Ensure the trigger exists (in case it was dropped)
drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- 2. access_requests table
create table if not exists public.access_requests (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  email text not null,
  full_name text,
  status text not null default 'pending' check (status in ('pending','approved','rejected')),
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id)
);

grant select, insert, update, delete on public.access_requests to authenticated;
grant all on public.access_requests to service_role;

alter table public.access_requests enable row level security;

create policy "access_requests: self read"
  on public.access_requests for select
  to authenticated
  using (user_id = auth.uid() or private.is_staff(auth.uid()));

create policy "access_requests: self insert"
  on public.access_requests for insert
  to authenticated
  with check (user_id = auth.uid());

create policy "access_requests: staff update"
  on public.access_requests for update
  to authenticated
  using (private.is_staff(auth.uid()))
  with check (private.is_staff(auth.uid()));

create policy "access_requests: staff delete"
  on public.access_requests for delete
  to authenticated
  using (private.is_staff(auth.uid()));

-- 3. contact_messages table
create table if not exists public.contact_messages (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  email text not null,
  message text not null,
  created_at timestamptz not null default now()
);

grant select, delete on public.contact_messages to authenticated;
grant insert on public.contact_messages to anon, authenticated;
grant all on public.contact_messages to service_role;

alter table public.contact_messages enable row level security;

create policy "contact_messages: public insert"
  on public.contact_messages for insert
  to anon, authenticated
  with check (
    char_length(name) between 1 and 100
    and char_length(email) between 3 and 255
    and char_length(message) between 1 and 2000
  );

create policy "contact_messages: staff read"
  on public.contact_messages for select
  to authenticated
  using (private.is_staff(auth.uid()));

create policy "contact_messages: staff delete"
  on public.contact_messages for delete
  to authenticated
  using (private.is_staff(auth.uid()));
