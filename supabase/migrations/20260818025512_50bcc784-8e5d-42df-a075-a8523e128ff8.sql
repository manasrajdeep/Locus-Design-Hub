ALTER TABLE public.homepage_content
  ADD COLUMN IF NOT EXISTS draft jsonb NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS draft_updated_at timestamptz,
  ADD COLUMN IF NOT EXISTS published_at timestamptz NOT NULL DEFAULT now();

-- Draft copy starts as the live content so the editor opens on the current page.
UPDATE public.homepage_content
SET draft = jsonb_build_object(
      'hero_title', hero_title,
      'hero_subtitle', hero_subtitle,
      'hero_image_url', hero_image_url,
      'stats', stats,
      'services', services,
      'portfolio', portfolio,
      'sections', sections
    ),
    draft_updated_at = now()
WHERE draft = '{}'::jsonb;

-- Unpublished draft copy should not be readable by the public; the live columns still are.
REVOKE SELECT ON public.homepage_content FROM anon;
GRANT SELECT (id, singleton, hero_title, hero_subtitle, hero_image_url, stats, services, portfolio, sections, updated_at, published_at)
  ON public.homepage_content TO anon;

CREATE TABLE IF NOT EXISTS public.homepage_versions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  content jsonb NOT NULL,
  note text NOT NULL DEFAULT 'Published',
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT ON public.homepage_versions TO authenticated;
GRANT ALL ON public.homepage_versions TO service_role;
ALTER TABLE public.homepage_versions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "homepage versions: superadmin read" ON public.homepage_versions;
CREATE POLICY "homepage versions: superadmin read" ON public.homepage_versions
  FOR SELECT TO authenticated
  USING (private.has_role(auth.uid(), 'superadmin'::public.app_role));

DROP POLICY IF EXISTS "homepage versions: superadmin insert" ON public.homepage_versions;
CREATE POLICY "homepage versions: superadmin insert" ON public.homepage_versions
  FOR INSERT TO authenticated
  WITH CHECK (private.has_role(auth.uid(), 'superadmin'::public.app_role));

CREATE INDEX IF NOT EXISTS homepage_versions_created_at_idx ON public.homepage_versions (created_at DESC);

-- Seed the history with the currently live homepage so there is always a restore point.
INSERT INTO public.homepage_versions (content, note)
SELECT jsonb_build_object(
         'hero_title', hero_title,
         'hero_subtitle', hero_subtitle,
         'hero_image_url', hero_image_url,
         'stats', stats,
         'services', services,
         'portfolio', portfolio,
         'sections', sections
       ),
       'Initial snapshot'
FROM public.homepage_content
WHERE NOT EXISTS (SELECT 1 FROM public.homepage_versions);