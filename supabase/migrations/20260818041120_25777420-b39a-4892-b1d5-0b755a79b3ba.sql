-- Reset over-broad Data API grants, then re-grant the minimum each role needs.
REVOKE ALL ON public.access_requests, public.contact_messages, public.customer_whitelist,
  public.homepage_content, public.homepage_versions, public.messages, public.profiles,
  public.project_activity, public.project_documents, public.project_updates,
  public.projects, public.user_roles
FROM anon, authenticated;

-- Public homepage: anonymous visitors may read published columns only (no draft).
GRANT SELECT (id, singleton, hero_title, hero_subtitle, hero_image_url, stats, services,
  portfolio, sections, updated_at, published_at) ON public.homepage_content TO anon;
GRANT SELECT, UPDATE ON public.homepage_content TO authenticated;
GRANT ALL ON public.homepage_content TO service_role;

GRANT SELECT, INSERT ON public.homepage_versions TO authenticated;
GRANT ALL ON public.homepage_versions TO service_role;

-- Contact form is open to the public (insert only, guarded by its RLS check).
GRANT INSERT ON public.contact_messages TO anon;
GRANT SELECT, INSERT, DELETE ON public.contact_messages TO authenticated;
GRANT ALL ON public.contact_messages TO service_role;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.access_requests TO authenticated;
GRANT ALL ON public.access_requests TO service_role;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.customer_whitelist TO authenticated;
GRANT ALL ON public.customer_whitelist TO service_role;

GRANT SELECT, INSERT ON public.messages TO authenticated;
GRANT ALL ON public.messages TO service_role;

GRANT SELECT, UPDATE ON public.profiles TO authenticated;
GRANT ALL ON public.profiles TO service_role;

GRANT SELECT, INSERT ON public.project_activity TO authenticated;
GRANT ALL ON public.project_activity TO service_role;

GRANT SELECT, INSERT, DELETE ON public.project_documents TO authenticated;
GRANT ALL ON public.project_documents TO service_role;

GRANT SELECT, INSERT, DELETE ON public.project_updates TO authenticated;
GRANT ALL ON public.project_updates TO service_role;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.projects TO authenticated;
GRANT ALL ON public.projects TO service_role;

GRANT SELECT ON public.user_roles TO authenticated;
GRANT ALL ON public.user_roles TO service_role;
