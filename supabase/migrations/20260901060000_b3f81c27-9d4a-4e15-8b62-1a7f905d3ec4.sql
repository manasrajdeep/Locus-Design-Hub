-- ============================================================================
-- Take back the privileges `anon` inherited by default
-- ============================================================================
-- Supabase ships ALTER DEFAULT PRIVILEGES granting ALL on new tables in `public`
-- to anon, authenticated and service_role. Every table here was created with an
-- explicit grant list that overrode that — except `homepage_drafts`, which
-- inherited the default and so handed `anon` SELECT, INSERT, UPDATE, DELETE,
-- TRUNCATE, REFERENCES and TRIGGER on the CMS working copy.
--
-- Row-level security stopped it being exploitable: every policy on that table is
-- scoped to `authenticated`, so an anonymous request matched none and affected
-- zero rows. But TRUNCATE is not subject to row-level security at all, and a
-- grant nobody intended is one permissive policy away from mattering.
--
-- This revokes everything from anon across the schema and grants back only what
-- the public site genuinely needs:
--   * homepage_content SELECT — the homepage renders from it
--   * contact_messages INSERT — the public contact form writes to it
-- `authenticated` and `service_role` are untouched; their access is what the
-- policies are written against.

DO $$
DECLARE
  t record;
BEGIN
  FOR t IN
    SELECT tablename FROM pg_tables WHERE schemaname = 'public'
  LOOP
    EXECUTE format('REVOKE ALL ON public.%I FROM anon', t.tablename);
  END LOOP;
END $$;

GRANT SELECT ON public.homepage_content TO anon;
GRANT INSERT ON public.contact_messages TO anon;

-- Stop the same thing happening to the next table someone adds.
ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL ON TABLES FROM anon;
