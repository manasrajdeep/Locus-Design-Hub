-- ============================================================================
-- Trim the homepage meta description below Google's truncation point
-- ============================================================================
-- The description renders at 163 characters; search engines cut it off at
-- roughly 160, so the sentence was being clipped mid-phrase in results.
--
-- Fixing DEFAULT_SECTIONS in src/lib/homepage.ts is not enough on its own:
-- `mergeSections` layers the stored `sections` JSON over the defaults, and this
-- row carries its own copy of the text. The live value therefore comes from the
-- database and has to be corrected here.
--
-- Both places are updated. `homepage_drafts` holds the editor's working copy,
-- and publishing writes that copy over `homepage_content` — so correcting only
-- the published row would let the next publish put the long version straight
-- back.
--
-- Each statement is guarded on the exact previous text, which makes this
-- idempotent and means it will not overwrite a description someone has since
-- rewritten through the CMS.

UPDATE public.homepage_content
SET sections = jsonb_set(
      sections,
      '{seo,description}',
      to_jsonb(
        'Locus Design builds residential, commercial and design-build projects — engineered detailing, transparent daily site reporting and a private client portal.'::text
      ),
      true
    ),
    updated_at = now()
WHERE sections -> 'seo' ->> 'description'
    = 'Locus Design builds premium residential, commercial and design-build projects — engineered detailing, transparent daily site reporting and a private client portal.';

UPDATE public.homepage_drafts
SET content = jsonb_set(
      content,
      '{sections,seo,description}',
      to_jsonb(
        'Locus Design builds residential, commercial and design-build projects — engineered detailing, transparent daily site reporting and a private client portal.'::text
      ),
      true
    ),
    updated_at = now()
WHERE content -> 'sections' -> 'seo' ->> 'description'
    = 'Locus Design builds premium residential, commercial and design-build projects — engineered detailing, transparent daily site reporting and a private client portal.';
