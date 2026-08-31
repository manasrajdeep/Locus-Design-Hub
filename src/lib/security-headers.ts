/**
 * Security headers for responses this Worker generates.
 *
 * `public/_headers` covers *static assets* only — Cloudflare applies that file
 * when it serves something out of the assets binding, and never to a response
 * the Worker itself returns. Every HTML page here is server-rendered by the
 * Worker, so without this the pages that actually matter — the portal, the
 * admin dashboard, the CMS — shipped with no clickjacking or CSP protection at
 * all while the images were fully covered.
 *
 * Keep this list and `public/_headers` in step; they are deliberately the same
 * policy applied at the two different layers.
 */
export const SECURITY_HEADERS: Record<string, string> = {
  // Nothing here is meant to be framed.
  "X-Frame-Options": "DENY",
  // Stop MIME sniffing turning an upload into an executable response.
  "X-Content-Type-Options": "nosniff",
  // Portal and admin URLs carry project ids; don't leak them cross-origin.
  "Referrer-Policy": "strict-origin-when-cross-origin",
  "Permissions-Policy": "camera=(), microphone=(), geolocation=(), interest-cohort=()",
  // 2 years + preload. Safe only because the origin is HTTPS-only.
  "Strict-Transport-Security": "max-age=63072000; includeSubDomains; preload",
  // Report-only first. The app inlines styles and pulls Google Fonts, and a
  // wrong blocking policy takes the site down — promote this to
  // `Content-Security-Policy` once the reports come back clean.
  "Content-Security-Policy-Report-Only": [
    "default-src 'self'",
    "script-src 'self' 'unsafe-inline'",
    "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
    "font-src 'self' https://fonts.gstatic.com",
    "img-src 'self' data: blob: https:",
    "connect-src 'self' https://*.supabase.co wss://*.supabase.co https://*.ingest.sentry.io",
    "frame-ancestors 'none'",
    "base-uri 'self'",
    "form-action 'self'",
  ].join("; "),
};

/**
 * Returns `response` with the headers above applied.
 *
 * A header the response already set wins — a handler that deliberately chose
 * its own value (the MCP routes set their own CORS and cache policy) should not
 * be second-guessed here.
 */
export function withSecurityHeaders(response: Response): Response {
  const headers = new Headers(response.headers);
  for (const [name, value] of Object.entries(SECURITY_HEADERS)) {
    if (!headers.has(name)) headers.set(name, value);
  }
  // Body streams are single-use; reusing the original body preserves streaming.
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}
