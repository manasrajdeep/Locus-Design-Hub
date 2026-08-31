
CREATE SCHEMA IF NOT EXISTS private;
GRANT USAGE ON SCHEMA private TO authenticated, service_role;

-- Drop public-schema policies that reference the helpers
DROP POLICY IF EXISTS "whitelist: staff manage" ON public.customer_whitelist;
DROP POLICY IF EXISTS "homepage: superadmin update" ON public.homepage_content;
DROP POLICY IF EXISTS "messages: read" ON public.messages;
DROP POLICY IF EXISTS "messages: send" ON public.messages;
DROP POLICY IF EXISTS "profiles: self read" ON public.profiles;
DROP POLICY IF EXISTS "docs: read" ON public.project_documents;
DROP POLICY IF EXISTS "docs: staff delete" ON public.project_documents;
DROP POLICY IF EXISTS "docs: staff write" ON public.project_documents;
DROP POLICY IF EXISTS "updates: read" ON public.project_updates;
DROP POLICY IF EXISTS "updates: staff delete" ON public.project_updates;
DROP POLICY IF EXISTS "updates: staff write" ON public.project_updates;
DROP POLICY IF EXISTS "projects: access" ON public.projects;
DROP POLICY IF EXISTS "projects: staff insert" ON public.projects;
DROP POLICY IF EXISTS "projects: staff update" ON public.projects;
DROP POLICY IF EXISTS "projects: superadmin delete" ON public.projects;
DROP POLICY IF EXISTS "user_roles: self read" ON public.user_roles;

-- Drop storage policies that reference the helpers
DROP POLICY IF EXISTS "project-images read" ON storage.objects;
DROP POLICY IF EXISTS "project-images write" ON storage.objects;
DROP POLICY IF EXISTS "project-images delete" ON storage.objects;
DROP POLICY IF EXISTS "project-documents read" ON storage.objects;
DROP POLICY IF EXISTS "project-documents write" ON storage.objects;
DROP POLICY IF EXISTS "project-documents delete" ON storage.objects;
DROP POLICY IF EXISTS "homepage superadmin write" ON storage.objects;
DROP POLICY IF EXISTS "homepage superadmin update" ON storage.objects;
DROP POLICY IF EXISTS "homepage superadmin delete" ON storage.objects;

-- Create helpers in private schema
CREATE OR REPLACE FUNCTION private.has_role(_user_id uuid, _role public.app_role)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$ select exists (select 1 from public.user_roles where user_id=_user_id and role=_role) $$;

CREATE OR REPLACE FUNCTION private.is_staff(_user_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$ select exists (select 1 from public.user_roles where user_id=_user_id and role in ('admin','superadmin')) $$;

CREATE OR REPLACE FUNCTION private.can_access_project(_project_id uuid, _user_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  select exists (
    select 1 from public.projects p
    where p.id = _project_id
      and (p.customer_id = _user_id
        or p.assigned_admin_id = _user_id
        or private.has_role(_user_id,'superadmin'))
  )
$$;

REVOKE ALL ON FUNCTION private.has_role(uuid, public.app_role) FROM PUBLIC;
REVOKE ALL ON FUNCTION private.is_staff(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION private.can_access_project(uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION private.has_role(uuid, public.app_role) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION private.is_staff(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION private.can_access_project(uuid, uuid) TO authenticated, service_role;

-- Drop old public helpers
DROP FUNCTION IF EXISTS public.has_role(uuid, public.app_role);
DROP FUNCTION IF EXISTS public.is_staff(uuid);
DROP FUNCTION IF EXISTS public.can_access_project(uuid, uuid);

-- Recreate public-schema policies
CREATE POLICY "whitelist: staff manage" ON public.customer_whitelist
  FOR ALL TO authenticated
  USING (private.is_staff(auth.uid())) WITH CHECK (private.is_staff(auth.uid()));

CREATE POLICY "homepage: superadmin update" ON public.homepage_content
  FOR UPDATE TO authenticated
  USING (private.has_role(auth.uid(), 'superadmin'::public.app_role))
  WITH CHECK (private.has_role(auth.uid(), 'superadmin'::public.app_role));

CREATE POLICY "messages: read" ON public.messages
  FOR SELECT TO authenticated USING (private.can_access_project(project_id, auth.uid()));

CREATE POLICY "messages: send" ON public.messages
  FOR INSERT TO authenticated
  WITH CHECK ((sender_id = auth.uid()) AND private.can_access_project(project_id, auth.uid()));

CREATE POLICY "profiles: self read" ON public.profiles
  FOR SELECT TO authenticated USING ((id = auth.uid()) OR private.is_staff(auth.uid()));

CREATE POLICY "docs: read" ON public.project_documents
  FOR SELECT TO authenticated USING (private.can_access_project(project_id, auth.uid()));

CREATE POLICY "docs: staff delete" ON public.project_documents
  FOR DELETE TO authenticated
  USING (private.is_staff(auth.uid()) AND private.can_access_project(project_id, auth.uid()));

CREATE POLICY "docs: staff write" ON public.project_documents
  FOR INSERT TO authenticated
  WITH CHECK (private.is_staff(auth.uid()) AND private.can_access_project(project_id, auth.uid()));

CREATE POLICY "updates: read" ON public.project_updates
  FOR SELECT TO authenticated USING (private.can_access_project(project_id, auth.uid()));

CREATE POLICY "updates: staff delete" ON public.project_updates
  FOR DELETE TO authenticated
  USING (private.is_staff(auth.uid()) AND private.can_access_project(project_id, auth.uid()));

CREATE POLICY "updates: staff write" ON public.project_updates
  FOR INSERT TO authenticated
  WITH CHECK (private.is_staff(auth.uid()) AND private.can_access_project(project_id, auth.uid()));

CREATE POLICY "projects: access" ON public.projects
  FOR SELECT TO authenticated
  USING ((customer_id = auth.uid()) OR (assigned_admin_id = auth.uid()) OR private.has_role(auth.uid(), 'superadmin'::public.app_role));

CREATE POLICY "projects: staff insert" ON public.projects
  FOR INSERT TO authenticated WITH CHECK (private.is_staff(auth.uid()));

CREATE POLICY "projects: staff update" ON public.projects
  FOR UPDATE TO authenticated
  USING ((assigned_admin_id = auth.uid()) OR private.has_role(auth.uid(), 'superadmin'::public.app_role))
  WITH CHECK ((assigned_admin_id = auth.uid()) OR private.has_role(auth.uid(), 'superadmin'::public.app_role));

CREATE POLICY "projects: superadmin delete" ON public.projects
  FOR DELETE TO authenticated
  USING (private.has_role(auth.uid(), 'superadmin'::public.app_role));

CREATE POLICY "user_roles: self read" ON public.user_roles
  FOR SELECT TO authenticated USING ((user_id = auth.uid()) OR private.is_staff(auth.uid()));

-- Recreate storage policies
CREATE POLICY "project-images read" ON storage.objects
  FOR SELECT TO authenticated
  USING (bucket_id = 'project-images' AND private.can_access_project((split_part(name,'/',1))::uuid, auth.uid()));

CREATE POLICY "project-images write" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'project-images' AND private.is_staff(auth.uid()) AND private.can_access_project((split_part(name,'/',1))::uuid, auth.uid()));

CREATE POLICY "project-images delete" ON storage.objects
  FOR DELETE TO authenticated
  USING (bucket_id = 'project-images' AND private.is_staff(auth.uid()) AND private.can_access_project((split_part(name,'/',1))::uuid, auth.uid()));

CREATE POLICY "project-documents read" ON storage.objects
  FOR SELECT TO authenticated
  USING (bucket_id = 'project-documents' AND private.can_access_project((split_part(name,'/',1))::uuid, auth.uid()));

CREATE POLICY "project-documents write" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'project-documents' AND private.is_staff(auth.uid()) AND private.can_access_project((split_part(name,'/',1))::uuid, auth.uid()));

CREATE POLICY "project-documents delete" ON storage.objects
  FOR DELETE TO authenticated
  USING (bucket_id = 'project-documents' AND private.is_staff(auth.uid()) AND private.can_access_project((split_part(name,'/',1))::uuid, auth.uid()));

CREATE POLICY "homepage superadmin write" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'homepage' AND private.has_role(auth.uid(), 'superadmin'::public.app_role));

CREATE POLICY "homepage superadmin update" ON storage.objects
  FOR UPDATE TO authenticated
  USING (bucket_id = 'homepage' AND private.has_role(auth.uid(), 'superadmin'::public.app_role));

CREATE POLICY "homepage superadmin delete" ON storage.objects
  FOR DELETE TO authenticated
  USING (bucket_id = 'homepage' AND private.has_role(auth.uid(), 'superadmin'::public.app_role));

-- Lock down signup trigger function
REVOKE ALL ON FUNCTION public.handle_new_user() FROM PUBLIC;
