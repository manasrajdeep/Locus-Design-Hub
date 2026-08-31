-- Restrict signed-in reads to published homepage columns only
REVOKE SELECT ON public.homepage_content FROM authenticated;
GRANT SELECT (id, singleton, hero_title, hero_subtitle, hero_image_url, stats, services, portfolio, sections, updated_at, published_at) ON public.homepage_content TO authenticated;

-- Superadmin-only access to draft content
CREATE OR REPLACE FUNCTION public.get_homepage_editor_state()
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, private
AS $$
DECLARE result jsonb;
BEGIN
  IF NOT private.has_role(auth.uid(), 'superadmin'::app_role) THEN
    RAISE EXCEPTION 'not authorized';
  END IF;
  SELECT to_jsonb(h) INTO result FROM public.homepage_content h LIMIT 1;
  RETURN result;
END;
$$;

REVOKE ALL ON FUNCTION public.get_homepage_editor_state() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_homepage_editor_state() TO authenticated;