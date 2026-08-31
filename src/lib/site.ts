/**
 * The public origin of this site — the single source of truth.
 *
 * Canonical tags, Open Graph URLs, JSON-LD, the sitemap, robots.txt and the
 * IndexNow/Search Console submissions all derive from this value. Anything that
 * needs the site's absolute URL must import it from here; hardcoding a host in
 * a second place is how the canonical tag and the sitemap end up disagreeing.
 *
 * Set VITE_SITE_URL in .env (and as the SITE_URL repository variable in CI) to
 * the production domain, with scheme and no trailing slash.
 */
const FALLBACK_SITE_URL = "https://locusdesign.in";

function resolveSiteUrl(): string {
  const configured =
    (typeof import.meta !== "undefined" ? import.meta.env?.VITE_SITE_URL : undefined) ??
    (typeof process !== "undefined" ? process.env?.["SITE_URL"] : undefined) ??
    FALLBACK_SITE_URL;
  return String(configured).trim().replace(/\/+$/, "");
}

export const SITE_URL = resolveSiteUrl();

/** Absolute URL for a site-relative path, e.g. absoluteUrl("/") → "https://…/". */
export function absoluteUrl(path = "/"): string {
  return `${SITE_URL}${path.startsWith("/") ? path : `/${path}`}`;
}

export const SITEMAP_URL = absoluteUrl("/sitemap.xml");

/**
 * IndexNow key. The matching file must be served at
 * `${SITE_URL}/${INDEXNOW_KEY}.txt` — see public/<key>.txt.
 */
export const INDEXNOW_KEY = "e28f6c41b7a94d6ab3f0d5c7e91a4b28";
