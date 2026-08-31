GRANT SELECT ON public.homepage_content TO anon;
GRANT SELECT, UPDATE ON public.homepage_content TO authenticated;
GRANT ALL ON public.homepage_content TO service_role;

GRANT SELECT, INSERT ON public.homepage_versions TO authenticated;
GRANT ALL ON public.homepage_versions TO service_role;