CREATE TABLE public.project_activity (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  project_id uuid NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  actor_id uuid REFERENCES auth.users(id),
  actor_name text,
  action text NOT NULL DEFAULT 'status_change',
  milestone text NOT NULL,
  from_status text,
  to_status text,
  created_at timestamp with time zone NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT ON public.project_activity TO authenticated;
GRANT ALL ON public.project_activity TO service_role;

ALTER TABLE public.project_activity ENABLE ROW LEVEL SECURITY;

CREATE POLICY "activity: read" ON public.project_activity
  FOR SELECT TO authenticated
  USING (private.can_access_project(project_id, auth.uid()));

CREATE POLICY "activity: staff write" ON public.project_activity
  FOR INSERT TO authenticated
  WITH CHECK (private.is_staff(auth.uid()) AND private.can_access_project(project_id, auth.uid()));

CREATE INDEX project_activity_project_created_idx ON public.project_activity (project_id, created_at DESC);

ALTER TABLE public.projects REPLICA IDENTITY FULL;
ALTER TABLE public.project_activity REPLICA IDENTITY FULL;

DO $$
BEGIN
  BEGIN ALTER PUBLICATION supabase_realtime ADD TABLE public.projects; EXCEPTION WHEN duplicate_object THEN NULL; END;
  BEGIN ALTER PUBLICATION supabase_realtime ADD TABLE public.project_activity; EXCEPTION WHEN duplicate_object THEN NULL; END;
  BEGIN ALTER PUBLICATION supabase_realtime ADD TABLE public.project_updates; EXCEPTION WHEN duplicate_object THEN NULL; END;
  BEGIN ALTER PUBLICATION supabase_realtime ADD TABLE public.project_documents; EXCEPTION WHEN duplicate_object THEN NULL; END;
END $$;