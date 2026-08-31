-- Move draft content into its own superadmin-only table
CREATE TABLE IF NOT EXISTS public.homepage_drafts (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  content_id uuid NOT NULL REFERENCES public.homepage_content(id) ON DELETE CASCADE UNIQUE,
  content jsonb NOT NULL DEFAULT '{}'::jsonb,
  updated_at timestamptz NULL
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.homepage_drafts TO authenticated;
GRANT ALL ON public.homepage_drafts TO service_role;

ALTER TABLE public.homepage_drafts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "homepage drafts: superadmin read" ON public.homepage_drafts
  FOR SELECT TO authenticated USING (private.has_role(auth.uid(), 'superadmin'::app_role));
CREATE POLICY "homepage drafts: superadmin insert" ON public.homepage_drafts
  FOR INSERT TO authenticated WITH CHECK (private.has_role(auth.uid(), 'superadmin'::app_role));
CREATE POLICY "homepage drafts: superadmin update" ON public.homepage_drafts
  FOR UPDATE TO authenticated USING (private.has_role(auth.uid(), 'superadmin'::app_role))
  WITH CHECK (private.has_role(auth.uid(), 'superadmin'::app_role));

INSERT INTO public.homepage_drafts (content_id, content, updated_at)
SELECT h.id, h.draft, h.draft_updated_at FROM public.homepage_content h
ON CONFLICT (content_id) DO NOTHING;

ALTER TABLE public.homepage_content DROP COLUMN IF EXISTS draft;
ALTER TABLE public.homepage_content DROP COLUMN IF EXISTS draft_updated_at;

-- Public/signed-in reads now cover the whole (published-only) table again
GRANT SELECT ON public.homepage_content TO authenticated;

DROP FUNCTION IF EXISTS public.get_homepage_editor_state();