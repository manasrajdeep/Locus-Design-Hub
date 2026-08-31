-- ============================================================================
-- Move the bundled homepage images off the external asset host
-- ============================================================================
-- The images that ship with the build used to be served from an external asset
-- host as `/<prefix>/assets-v1/<uuid>/in-<name>.<ext>`. Nothing in a
-- self-hosted deploy serves that path, so every one of them 404'd: the
-- homepage rendered as blur-up placeholders and og:image was dropped entirely.
--
-- They now ship in `public/media` as `/media/<name>.<ext>`. This rewrites the
-- URLs the database still holds so the served HTML stops pointing at a host
-- that is not ours.
--
-- Three columns carry them: `hero_image_url` (a plain text column), `portfolio`
-- (a JSON array of items with an `image_url` field) and `image_variants` (a JSON
-- object *keyed* by the image URL). `homepage_drafts.content` nests all three
-- again under its own blob, and publishing copies the draft over the published
-- row — so fixing only `homepage_content` would let the next publish put the
-- dead URLs straight back.
--
-- `homepage_versions` is deliberately NOT rewritten. Those blobs are the record
-- of what was actually published at the time; editing them to match a later
-- refactor would make a rollback silently differ from the version it claims to
-- restore. `normalizeImageSrc` in src/lib/image-registry.ts maps the legacy
-- form at read time instead, so rolling back to an old version still resolves.
--
-- The rewrite keeps the filename and drops the host prefix, the uuid segment
-- and the `in-` upload prefix:
--   /__l5e/assets-v1/96edb86e-.../in-hero-1200w.avif  ->  /media/hero-1200w.avif
--
-- Every statement is a no-op once applied, and each is guarded on the old path
-- still being present, so a URL someone has since changed through the CMS is
-- left alone.

-- 1. hero_image_url — plain text, anchored because it is a single whole URL.
UPDATE public.homepage_content
SET hero_image_url = regexp_replace(
      hero_image_url, '^/__[a-z0-9]+/assets-v1/[0-9a-f-]{36}/(in-)?', '/media/'
    ),
    updated_at = now()
WHERE hero_image_url ~ '^/__[a-z0-9]+/assets-v1/[0-9a-f-]{36}/';

-- 2. portfolio — a JSON array; rewrite every occurrence in the serialised blob.
UPDATE public.homepage_content
SET portfolio = regexp_replace(
      portfolio::text, '/__[a-z0-9]+/assets-v1/[0-9a-f-]{36}/(in-)?', '/media/', 'g'
    )::jsonb,
    updated_at = now()
WHERE portfolio::text ~ '/__[a-z0-9]+/assets-v1/';

-- 3. image_variants — keyed *by* the URL, so the keys move too.
UPDATE public.homepage_content
SET image_variants = regexp_replace(
      image_variants::text, '/__[a-z0-9]+/assets-v1/[0-9a-f-]{36}/(in-)?', '/media/', 'g'
    )::jsonb,
    updated_at = now()
WHERE image_variants::text ~ '/__[a-z0-9]+/assets-v1/';

-- 4. The editor's working copy, which nests all three under one blob.
UPDATE public.homepage_drafts
SET content = regexp_replace(
      content::text, '/__[a-z0-9]+/assets-v1/[0-9a-f-]{36}/(in-)?', '/media/', 'g'
    )::jsonb,
    updated_at = now()
WHERE content::text ~ '/__[a-z0-9]+/assets-v1/';
