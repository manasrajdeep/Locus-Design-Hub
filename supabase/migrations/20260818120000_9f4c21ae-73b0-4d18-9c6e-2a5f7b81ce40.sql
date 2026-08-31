-- ============================================================================
-- 1. Safe project-id extraction for storage policies
-- ============================================================================
-- The storage policies cast the first path segment straight to uuid:
--     private.can_access_project((split_part(name,'/',1))::uuid, auth.uid())
-- Every policy on storage.objects is permissive, so they are OR'ed together and
-- evaluated against rows from *all* buckets. Objects in `homepage-media` are
-- named `homepage/<timestamp>-<rand>.jpg`, whose first segment is not a uuid,
-- and Postgres does not guarantee the `bucket_id = '...'` test short-circuits
-- before the cast. When it does not, the query fails outright with
--     invalid input syntax for type uuid: "homepage"
-- which surfaces as a broken listing/download rather than a clean denial.
--
-- This helper returns NULL instead of raising. can_access_project(NULL, uid) is
-- false (no row matches `p.id = NULL`), so a non-conforming path denies access.
CREATE OR REPLACE FUNCTION private.project_id_from_path(_name text)
RETURNS uuid
LANGUAGE sql
IMMUTABLE
PARALLEL SAFE
AS $$
  SELECT CASE
    WHEN split_part(coalesce(_name, ''), '/', 1)
         ~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$'
    THEN split_part(_name, '/', 1)::uuid
    ELSE NULL
  END
$$;

REVOKE ALL ON FUNCTION private.project_id_from_path(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION private.project_id_from_path(text) TO authenticated, service_role;

-- Rebuild the six private-bucket policies on top of the safe helper.
DROP POLICY IF EXISTS "project-images read" ON storage.objects;
DROP POLICY IF EXISTS "project-images write" ON storage.objects;
DROP POLICY IF EXISTS "project-images delete" ON storage.objects;
DROP POLICY IF EXISTS "project-documents read" ON storage.objects;
DROP POLICY IF EXISTS "project-documents write" ON storage.objects;
DROP POLICY IF EXISTS "project-documents delete" ON storage.objects;

CREATE POLICY "project-images read" ON storage.objects
  FOR SELECT TO authenticated
  USING (
    bucket_id = 'project-images'
    AND private.can_access_project(private.project_id_from_path(name), auth.uid())
  );

CREATE POLICY "project-images write" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'project-images'
    AND private.is_staff(auth.uid())
    AND private.can_access_project(private.project_id_from_path(name), auth.uid())
  );

CREATE POLICY "project-images delete" ON storage.objects
  FOR DELETE TO authenticated
  USING (
    bucket_id = 'project-images'
    AND private.is_staff(auth.uid())
    AND private.can_access_project(private.project_id_from_path(name), auth.uid())
  );

CREATE POLICY "project-documents read" ON storage.objects
  FOR SELECT TO authenticated
  USING (
    bucket_id = 'project-documents'
    AND private.can_access_project(private.project_id_from_path(name), auth.uid())
  );

CREATE POLICY "project-documents write" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'project-documents'
    AND private.is_staff(auth.uid())
    AND private.can_access_project(private.project_id_from_path(name), auth.uid())
  );

CREATE POLICY "project-documents delete" ON storage.objects
  FOR DELETE TO authenticated
  USING (
    bucket_id = 'project-documents'
    AND private.is_staff(auth.uid())
    AND private.can_access_project(private.project_id_from_path(name), auth.uid())
  );

-- ============================================================================
-- 2. Homepage media is public marketing art — serve it from public URLs
-- ============================================================================
-- Uploads previously stored a signed URL with a ten-year TTL directly in the
-- published content. Those tokens are signed with the project JWT secret, so a
-- secret rotation would break every homepage image at once, and the token was
-- being published in og:image. The bucket already had an anon SELECT policy;
-- marking it public makes /object/public/... work so plain, non-expiring URLs
-- can be stored instead.
UPDATE storage.buckets SET public = true WHERE id = 'homepage-media';

-- ============================================================================
-- 3. Responsive-variant manifest for CMS-uploaded images
-- ============================================================================
-- src/lib/image-variants.ts is generated at build time and keyed by hardcoded
-- URLs, so any image swapped in through the CMS had no srcset, no modern
-- format, no blur placeholder and no LCP preload. Uploads now generate their
-- own widths and record them here, keyed by the image's public URL.
ALTER TABLE public.homepage_content
  ADD COLUMN IF NOT EXISTS image_variants jsonb NOT NULL DEFAULT '{}'::jsonb;

-- anon held a column-level SELECT grant listing each published column, which
-- silently hides any column added later. The only unpublished content — the
-- editor draft — now lives in public.homepage_drafts, so every column on this
-- table is public by definition and a table-level grant is both correct and
-- less error-prone.
GRANT SELECT ON public.homepage_content TO anon;
