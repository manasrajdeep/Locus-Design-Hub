-- ============================================================================
-- 1. Rate-limit public contact submissions
-- ============================================================================
-- `contact_messages` grants INSERT to anon and the publishable key is, by
-- design, public. Anyone can therefore POST straight to
--     /rest/v1/contact_messages
-- and flood the table without ever loading the site. Throttling in the React
-- form would do nothing about that, so the limit has to live in the database,
-- where every entry path has to pass through it.
--
-- Throttle state is kept in the `private` schema with no grants to anon or
-- authenticated: only the SECURITY DEFINER trigger below can read or write it.
-- That keeps anything derived from a visitor's IP out of the table staff read.
CREATE TABLE IF NOT EXISTS private.contact_throttle (
  bucket text PRIMARY KEY,
  window_start timestamptz NOT NULL DEFAULT now(),
  count integer NOT NULL DEFAULT 0
);

REVOKE ALL ON TABLE private.contact_throttle FROM PUBLIC, anon, authenticated;

-- Per-IP allowance, and a global backstop so a distributed flood still cannot
-- run the table away from us.
CREATE OR REPLACE FUNCTION private.enforce_contact_rate_limit()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = private, public
AS $$
DECLARE
  -- Deliberately not tighter: the site targets India, where mobile carriers use
  -- CGNAT heavily, so a single address can legitimately be many prospects. Ten
  -- an hour still leaves a flood dead in the water.
  per_ip_limit    constant integer  := 10;
  global_limit    constant integer  := 100;
  window_length   constant interval := interval '1 hour';
  headers         json;
  claims          json;
  client_ip       text;
  bucket_key      text;
  current_count   integer;
  global_count    integer;
BEGIN
  -- Both of these settings are absent for some callers and set to the *empty
  -- string* for others — PostgREST does exactly that for anonymous requests —
  -- and `''::json` raises. Parsing them unguarded would make the trigger throw
  -- on every anonymous submission, i.e. break precisely the path it protects.
  BEGIN
    claims := nullif(current_setting('request.jwt.claims', true), '')::json;
  EXCEPTION WHEN others THEN
    claims := NULL;
  END;

  -- Trusted server-side callers (service role) are not throttled.
  IF coalesce(claims ->> 'role', '') = 'service_role' THEN
    RETURN NEW;
  END IF;

  BEGIN
    headers := nullif(current_setting('request.headers', true), '')::json;
  EXCEPTION WHEN others THEN
    headers := NULL;
  END;

  -- The browser posts to Supabase directly, not through the app's Cloudflare
  -- worker, so this request never passes through Cloudflare and there is no
  -- cf-connecting-ip on it. Supabase's own gateway sets x-forwarded-for, whose
  -- first entry is the client — that is the signal here, and it is present on
  -- direct PostgREST calls too, which is exactly the path being defended.
  -- cf-connecting-ip is kept only as a fallback in case this ever moves behind
  -- the worker.
  client_ip := coalesce(
    nullif(btrim(split_part(coalesce(headers ->> 'x-forwarded-for', ''), ',', 1)), ''),
    nullif(btrim(headers ->> 'cf-connecting-ip'), ''),
    'unknown'
  );

  -- Pseudonymous bucket key: enough to count against, not a stored IP.
  bucket_key := md5('contact:' || client_ip);

  INSERT INTO private.contact_throttle AS t (bucket, window_start, count)
  VALUES (bucket_key, now(), 1)
  ON CONFLICT (bucket) DO UPDATE
    SET count = CASE
          WHEN t.window_start < now() - window_length THEN 1
          ELSE t.count + 1
        END,
        window_start = CASE
          WHEN t.window_start < now() - window_length THEN now()
          ELSE t.window_start
        END
  RETURNING count INTO current_count;

  IF current_count > per_ip_limit THEN
    RAISE EXCEPTION 'contact_rate_limit_exceeded'
      USING HINT = 'Too many messages from this address. Please try again later.';
  END IF;

  SELECT count(*) INTO global_count
  FROM public.contact_messages
  WHERE created_at > now() - window_length;

  IF global_count >= global_limit THEN
    RAISE EXCEPTION 'contact_rate_limit_exceeded'
      USING HINT = 'The contact form is temporarily unavailable. Please try again later.';
  END IF;

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION private.enforce_contact_rate_limit() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS contact_messages_rate_limit ON public.contact_messages;
CREATE TRIGGER contact_messages_rate_limit
  BEFORE INSERT ON public.contact_messages
  FOR EACH ROW EXECUTE FUNCTION private.enforce_contact_rate_limit();

-- Supports the global-window count above.
CREATE INDEX IF NOT EXISTS contact_messages_created_at_idx
  ON public.contact_messages (created_at DESC);

-- ============================================================================
-- 2. A pending access request must actually be pending
-- ============================================================================
-- The insert policy only checked ownership, so a signed-in user could create
-- their own row with status 'approved'. That is not privilege escalation —
-- portal access is gated on owning a project, not on this row — but the row
-- vanishes from the admin's pending queue (which filters status = 'pending'),
-- so the person quietly never gets provisioned. Staff still move the status via
-- the separate staff-update policy.
DROP POLICY IF EXISTS "access_requests: self insert" ON public.access_requests;
CREATE POLICY "access_requests: self insert"
  ON public.access_requests FOR INSERT
  TO authenticated
  WITH CHECK (user_id = auth.uid() AND status = 'pending');

-- ============================================================================
-- 3. Homepage media should need the same role as publishing the homepage
-- ============================================================================
-- Writing homepage_content requires superadmin, but the homepage-media bucket
-- only required is_staff. A plain admin could therefore delete or replace the
-- images the live homepage points at — a change they are explicitly barred from
-- making through the CMS. Align the bucket with the table.
DROP POLICY IF EXISTS "staff can upload homepage media" ON storage.objects;
DROP POLICY IF EXISTS "staff can replace homepage media" ON storage.objects;
DROP POLICY IF EXISTS "staff can delete homepage media" ON storage.objects;

CREATE POLICY "superadmin can upload homepage media"
  ON storage.objects FOR INSERT
  TO authenticated
  WITH CHECK (
    bucket_id = 'homepage-media'
    AND private.has_role(auth.uid(), 'superadmin'::public.app_role)
  );

CREATE POLICY "superadmin can replace homepage media"
  ON storage.objects FOR UPDATE
  TO authenticated
  USING (
    bucket_id = 'homepage-media'
    AND private.has_role(auth.uid(), 'superadmin'::public.app_role)
  )
  WITH CHECK (
    bucket_id = 'homepage-media'
    AND private.has_role(auth.uid(), 'superadmin'::public.app_role)
  );

CREATE POLICY "superadmin can delete homepage media"
  ON storage.objects FOR DELETE
  TO authenticated
  USING (
    bucket_id = 'homepage-media'
    AND private.has_role(auth.uid(), 'superadmin'::public.app_role)
  );
