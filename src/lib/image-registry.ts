/**
 * Resolves responsive variants for an image URL.
 *
 * There are two sources, and both are needed:
 *
 *  - `IMAGE_VARIANTS` in image-variants.ts is generated at build time from the
 *    assets in src/assets/home. It covers the images the site shipped with.
 *  - CMS uploads happen long after the build, so they generate their own widths
 *    at upload time and store the manifest in `homepage_content.image_variants`.
 *    Those are registered here once the homepage content loads.
 *
 * Before this existed, swapping the hero through the CMS dropped the image out
 * of the build-time manifest and silently disabled srcset, modern formats, the
 * blur-up placeholder and the LCP preload.
 */
import { IMAGE_VARIANTS, type ImageEntry } from "@/lib/image-variants";

/**
 * Rewrites a legacy asset-host URL onto the local `/media` path.
 *
 * The bundled homepage images used to be served from an external asset host as
 * `/<prefix>/assets-v1/<uuid>/in-<name>.<ext>`. They now ship in `public/media`
 * as `/media/<name>.<ext>`, but three places still hand us the old form:
 * `homepage_content.hero_image_url` and the portfolio rows until the data
 * migration runs, and `homepage_versions.content` forever — a one-click
 * rollback restores a blob written before the move, and those URLs would 404.
 *
 * Anything else (a Supabase Storage URL from a CMS upload, an Unsplash URL, an
 * already-local path) is returned untouched.
 */
const LEGACY_ASSET_URL = /^\/__[a-z0-9]+\/assets-v1\/[0-9a-f-]{36}\/(?:in-)?(.+)$/i;

export function normalizeImageSrc(src: string): string {
  const match = LEGACY_ASSET_URL.exec(src);
  return match ? `/media/${match[1]}` : src;
}

export type ImageVariantMap = Record<string, ImageEntry>;

/**
 * Variants published through the CMS.
 *
 * Module-level on purpose: `ResponsiveImage` is used deep in the tree and
 * threading a map through every caller would be noise. The homepage content is
 * a singleton, so on the server every request resolves the same manifest and
 * sharing it across requests is safe.
 */
let cmsVariants: ImageVariantMap = {};

export function registerImageVariants(map: ImageVariantMap | null | undefined): void {
  cmsVariants = map && typeof map === "object" ? map : {};
}

/**
 * Build-time manifest wins: if an image ships with the app *and* someone
 * uploaded one at the same URL, the generated set is the more complete one
 * (it includes AVIF, which browsers cannot encode client-side).
 */
export function lookupVariants(src: string, overrides?: ImageVariantMap): ImageEntry | undefined {
  const local = normalizeImageSrc(src);
  return (
    IMAGE_VARIANTS[local] ??
    overrides?.[src] ??
    overrides?.[local] ??
    cmsVariants[src] ??
    cmsVariants[local]
  );
}
