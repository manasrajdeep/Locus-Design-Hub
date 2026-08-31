
-- =========================
-- ENUM: app_role
-- =========================
create type public.app_role as enum ('customer','admin','superadmin');

-- =========================
-- profiles
-- =========================
create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text not null,
  full_name text,
  avatar_url text,
  created_at timestamptz not null default now()
);
grant select, insert, update on public.profiles to authenticated;
grant all on public.profiles to service_role;
alter table public.profiles enable row level security;

-- =========================
-- user_roles
-- =========================
create table public.user_roles (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  role public.app_role not null,
  unique(user_id, role)
);
grant select on public.user_roles to authenticated;
grant all on public.user_roles to service_role;
alter table public.user_roles enable row level security;

create or replace function public.has_role(_user_id uuid, _role public.app_role)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.user_roles where user_id=_user_id and role=_role)
$$;

create or replace function public.is_staff(_user_id uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.user_roles
    where user_id=_user_id and role in ('admin','superadmin')
  )
$$;

-- profiles policies
create policy "profiles: self read" on public.profiles for select to authenticated
  using (id = auth.uid() or public.is_staff(auth.uid()));
create policy "profiles: self update" on public.profiles for update to authenticated
  using (id = auth.uid()) with check (id = auth.uid());

-- user_roles policies (read-only for users; writes via service role / triggers)
create policy "user_roles: self read" on public.user_roles for select to authenticated
  using (user_id = auth.uid() or public.is_staff(auth.uid()));

-- =========================
-- customer_whitelist
-- =========================
create table public.customer_whitelist (
  id uuid primary key default gen_random_uuid(),
  email text not null unique,
  invited_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);
grant select, insert, update, delete on public.customer_whitelist to authenticated;
grant all on public.customer_whitelist to service_role;
alter table public.customer_whitelist enable row level security;

create policy "whitelist: staff manage" on public.customer_whitelist for all to authenticated
  using (public.is_staff(auth.uid())) with check (public.is_staff(auth.uid()));

-- =========================
-- Signup trigger: invite-only
-- =========================
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  is_whitelisted boolean;
  first_user boolean;
begin
  select count(*)=0 into first_user from auth.users where id <> new.id;

  select exists(select 1 from public.customer_whitelist where lower(email) = lower(new.email))
    into is_whitelisted;

  if not first_user and not is_whitelisted then
    raise exception 'This email is not invited. Please contact your project administrator.';
  end if;

  insert into public.profiles(id, email, full_name)
  values (new.id, new.email, coalesce(new.raw_user_meta_data->>'full_name', new.email));

  if first_user then
    insert into public.user_roles(user_id, role) values (new.id, 'superadmin');
  else
    insert into public.user_roles(user_id, role) values (new.id, 'customer');
  end if;

  return new;
end;
$$;

create trigger on_auth_user_created
after insert on auth.users
for each row execute function public.handle_new_user();

-- =========================
-- homepage_content (public CMS)
-- =========================
create table public.homepage_content (
  id uuid primary key default gen_random_uuid(),
  singleton boolean not null default true unique,
  hero_title text not null,
  hero_subtitle text not null,
  hero_image_url text not null,
  stats jsonb not null default '[]'::jsonb,
  services jsonb not null default '[]'::jsonb,
  portfolio jsonb not null default '[]'::jsonb,
  updated_at timestamptz not null default now()
);
grant select on public.homepage_content to anon, authenticated;
grant update on public.homepage_content to authenticated;
grant all on public.homepage_content to service_role;
alter table public.homepage_content enable row level security;

create policy "homepage: public read" on public.homepage_content for select
  using (true);
create policy "homepage: superadmin update" on public.homepage_content for update to authenticated
  using (public.has_role(auth.uid(),'superadmin')) with check (public.has_role(auth.uid(),'superadmin'));

-- Seed one row
insert into public.homepage_content (hero_title, hero_subtitle, hero_image_url, stats, services, portfolio)
values (
  'Building Landmarks, Delivering Trust',
  'Locus Design crafts premium residential and commercial construction — architectural rigor, engineered precision, and transparent client communication.',
  'https://images.unsplash.com/photo-1503387762-592deb58ef4e?w=1920&q=80&auto=format&fit=crop',
  '[
    {"label":"Projects Completed","value":"120+"},
    {"label":"Years of Craft","value":"18"},
    {"label":"On-Time Delivery","value":"98%"},
    {"label":"Client Satisfaction","value":"4.9/5"}
  ]'::jsonb,
  '[
    {"title":"Residential Construction","description":"Custom homes and premium villas built to last generations.","icon":"home"},
    {"title":"Commercial Builds","description":"Office towers, retail, and hospitality delivered on schedule.","icon":"building"},
    {"title":"Renovation & Retrofit","description":"Structural upgrades and refined finishing for existing buildings.","icon":"hammer"},
    {"title":"Design & Build","description":"End-to-end architectural design, engineering, and construction.","icon":"pencil-ruler"}
  ]'::jsonb,
  '[
    {"image_url":"https://images.unsplash.com/photo-1512917774080-9991f1c4c750?w=1200&q=80&auto=format&fit=crop","caption":"Hillside Residence"},
    {"image_url":"https://images.unsplash.com/photo-1600585154340-be6161a56a0c?w=1200&q=80&auto=format&fit=crop","caption":"Coastal Villa"},
    {"image_url":"https://images.unsplash.com/photo-1487958449943-2429e8be8625?w=1200&q=80&auto=format&fit=crop","caption":"Corporate Tower"},
    {"image_url":"https://images.unsplash.com/photo-1460574283810-2aab119d8511?w=1200&q=80&auto=format&fit=crop","caption":"Urban Loft"},
    {"image_url":"https://images.unsplash.com/photo-1523217582562-09d0def993a6?w=1200&q=80&auto=format&fit=crop","caption":"Retail Pavilion"},
    {"image_url":"https://images.unsplash.com/photo-1449844908441-8829872d2607?w=1200&q=80&auto=format&fit=crop","caption":"Boutique Hotel"}
  ]'::jsonb
);

-- =========================
-- projects
-- =========================
create table public.projects (
  id uuid primary key default gen_random_uuid(),
  customer_id uuid not null references auth.users(id) on delete cascade,
  assigned_admin_id uuid references auth.users(id) on delete set null,
  name text not null,
  address text,
  current_milestone int not null default 0,
  milestones jsonb not null default '[
    {"name":"Planning & Permits","status":"pending"},
    {"name":"Foundation","status":"pending"},
    {"name":"Framing","status":"pending"},
    {"name":"Roofing & Exterior","status":"pending"},
    {"name":"MEP & Interior","status":"pending"},
    {"name":"Finishing","status":"pending"},
    {"name":"Handover","status":"pending"}
  ]'::jsonb,
  created_at timestamptz not null default now()
);
grant select, insert, update, delete on public.projects to authenticated;
grant all on public.projects to service_role;
alter table public.projects enable row level security;

create or replace function public.can_access_project(_project_id uuid, _user_id uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.projects p
    where p.id = _project_id
      and (
        p.customer_id = _user_id
        or p.assigned_admin_id = _user_id
        or public.has_role(_user_id,'superadmin')
      )
  )
$$;

create policy "projects: access" on public.projects for select to authenticated
  using (
    customer_id = auth.uid()
    or assigned_admin_id = auth.uid()
    or public.has_role(auth.uid(),'superadmin')
  );
create policy "projects: staff insert" on public.projects for insert to authenticated
  with check (public.is_staff(auth.uid()));
create policy "projects: staff update" on public.projects for update to authenticated
  using (assigned_admin_id = auth.uid() or public.has_role(auth.uid(),'superadmin'))
  with check (assigned_admin_id = auth.uid() or public.has_role(auth.uid(),'superadmin'));
create policy "projects: superadmin delete" on public.projects for delete to authenticated
  using (public.has_role(auth.uid(),'superadmin'));

-- =========================
-- project_updates (timeline images)
-- =========================
create table public.project_updates (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  image_url text not null,
  caption text,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);
grant select, insert, update, delete on public.project_updates to authenticated;
grant all on public.project_updates to service_role;
alter table public.project_updates enable row level security;

create policy "updates: read" on public.project_updates for select to authenticated
  using (public.can_access_project(project_id, auth.uid()));
create policy "updates: staff write" on public.project_updates for insert to authenticated
  with check (public.is_staff(auth.uid()) and public.can_access_project(project_id, auth.uid()));
create policy "updates: staff delete" on public.project_updates for delete to authenticated
  using (public.is_staff(auth.uid()) and public.can_access_project(project_id, auth.uid()));

-- =========================
-- project_documents (PDFs)
-- =========================
create table public.project_documents (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  name text not null,
  file_path text not null,
  kind text not null default 'other',
  uploaded_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);
grant select, insert, update, delete on public.project_documents to authenticated;
grant all on public.project_documents to service_role;
alter table public.project_documents enable row level security;

create policy "docs: read" on public.project_documents for select to authenticated
  using (public.can_access_project(project_id, auth.uid()));
create policy "docs: staff write" on public.project_documents for insert to authenticated
  with check (public.is_staff(auth.uid()) and public.can_access_project(project_id, auth.uid()));
create policy "docs: staff delete" on public.project_documents for delete to authenticated
  using (public.is_staff(auth.uid()) and public.can_access_project(project_id, auth.uid()));

-- =========================
-- messages (realtime chat)
-- =========================
create table public.messages (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  sender_id uuid not null references auth.users(id) on delete cascade,
  body text not null,
  created_at timestamptz not null default now()
);
grant select, insert on public.messages to authenticated;
grant all on public.messages to service_role;
alter table public.messages enable row level security;

create policy "messages: read" on public.messages for select to authenticated
  using (public.can_access_project(project_id, auth.uid()));
create policy "messages: send" on public.messages for insert to authenticated
  with check (sender_id = auth.uid() and public.can_access_project(project_id, auth.uid()));

alter publication supabase_realtime add table public.messages;
alter table public.messages replica identity full;

-- =========================
-- Storage RLS
-- =========================
-- project-images bucket (private)
create policy "project-images read" on storage.objects for select to authenticated
  using (
    bucket_id = 'project-images'
    and public.can_access_project((split_part(name,'/',1))::uuid, auth.uid())
  );
create policy "project-images write" on storage.objects for insert to authenticated
  with check (
    bucket_id = 'project-images'
    and public.is_staff(auth.uid())
    and public.can_access_project((split_part(name,'/',1))::uuid, auth.uid())
  );
create policy "project-images delete" on storage.objects for delete to authenticated
  using (
    bucket_id = 'project-images'
    and public.is_staff(auth.uid())
    and public.can_access_project((split_part(name,'/',1))::uuid, auth.uid())
  );

-- project-documents bucket (private)
create policy "project-documents read" on storage.objects for select to authenticated
  using (
    bucket_id = 'project-documents'
    and public.can_access_project((split_part(name,'/',1))::uuid, auth.uid())
  );
create policy "project-documents write" on storage.objects for insert to authenticated
  with check (
    bucket_id = 'project-documents'
    and public.is_staff(auth.uid())
    and public.can_access_project((split_part(name,'/',1))::uuid, auth.uid())
  );
create policy "project-documents delete" on storage.objects for delete to authenticated
  using (
    bucket_id = 'project-documents'
    and public.is_staff(auth.uid())
    and public.can_access_project((split_part(name,'/',1))::uuid, auth.uid())
  );

-- homepage bucket (public read, superadmin write)
create policy "homepage public read" on storage.objects for select
  using (bucket_id = 'homepage');
create policy "homepage superadmin write" on storage.objects for insert to authenticated
  with check (bucket_id = 'homepage' and public.has_role(auth.uid(),'superadmin'));
create policy "homepage superadmin update" on storage.objects for update to authenticated
  using (bucket_id = 'homepage' and public.has_role(auth.uid(),'superadmin'));
create policy "homepage superadmin delete" on storage.objects for delete to authenticated
  using (bucket_id = 'homepage' and public.has_role(auth.uid(),'superadmin'));
