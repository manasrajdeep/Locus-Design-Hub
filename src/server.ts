import "./lib/error-capture";

import * as Sentry from "@sentry/cloudflare";

import { consumeLastCapturedError } from "./lib/error-capture";
import { renderErrorPage } from "./lib/error-page";
import { withSecurityHeaders } from "./lib/security-headers";

/**
 * Paths whose HTML is identical for every visitor and safe to cache at the edge.
 *
 * The marketing pages render from `homepage_content`, so without this every
 * single visit costs a full SSR plus a Supabase round trip — and the Worker runs
 * at the edge nearest the visitor while the database sits in one region, so that
 * round trip can cross continents. Caching collapses both for the common case.
 *
 * Deliberately a strict allow-list rather than "everything except /portal": a
 * new authenticated route added later would otherwise be cached by default, and
 * serving one client's project page to another is the worst failure this app
 * has. Anything not named here stays uncached.
 */
const CACHEABLE_PATHS = new Set(["/", "/robots.txt", "/sitemap.xml"]);

/**
 * Mark a public response cacheable.
 *
 * This sets the header only. Cloudflare does not cache a Worker's HTML on the
 * strength of it — that needs a Cache Rule on the zone, which is deliberately
 * left as a dashboard decision rather than something the app asserts. Driving
 * the Workers Cache API from here was tried and did not hold: `cache.put` never
 * produced a retrievable entry for the streamed SSR body, so every request still
 * rendered in full while the code implied otherwise.
 *
 * The header is still worth setting. Browsers honour `max-age` on repeat visits,
 * and it is the contract a Cache Rule would read. One minute is the trade: a
 * published CMS change appears within a minute, and `stale-while-revalidate`
 * means no visitor waits on the refresh.
 */
/**
 * Is this request eligible for the shared edge cache?
 *
 * A signed-in visitor must neither be served from it nor populate it — serving
 * one client's page to another is the worst failure this app has — so any
 * request carrying credentials is excluded outright.
 */
/**
 * The Workers runtime adds a `default` cache that the standard DOM
 * `CacheStorage` type does not declare, so it is narrowed here rather than
 * pulling in @cloudflare/workers-types for one property.
 *
 * `caches` is a Workers global and does not exist in Node, which is what the
 * Vite dev server runs on — referencing it unguarded threw
 * `ReferenceError: caches is not defined` on every request and took local
 * development down while production, which has the global, was fine.
 * Returning undefined there simply means no caching in dev, which is what you
 * want anyway.
 */
function edgeCache(): Cache | undefined {
  if (typeof caches === "undefined") return undefined;
  return (caches as CacheStorage & { default?: Cache }).default;
}

function isCacheable(request: Request): boolean {
  if (request.method !== "GET" && request.method !== "HEAD") return false;
  if (request.headers.get("authorization") || request.headers.get("cookie")) return false;
  return CACHEABLE_PATHS.has(new URL(request.url).pathname);
}

function withPublicCache(request: Request, response: Response): Response {
  if (response.status !== 200) return response;
  if (response.headers.has("cache-control")) return response;
  if (!isCacheable(request)) return response;

  const headers = new Headers(response.headers);
  headers.set("cache-control", "public, max-age=60, s-maxage=60, stale-while-revalidate=600");
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}

type ServerEntry = {
  fetch: (request: Request, env: unknown, ctx: unknown) => Promise<Response> | Response;
};

let serverEntryPromise: Promise<ServerEntry> | undefined;

async function getServerEntry(): Promise<ServerEntry> {
  if (!serverEntryPromise) {
    serverEntryPromise = import("@tanstack/react-start/server-entry").then(
      (m) => (m.default ?? m) as ServerEntry,
    );
  }
  return serverEntryPromise;
}

// h3 swallows in-handler throws into a normal 500 Response with body
// {"unhandled":true,"message":"HTTPError"} — try/catch alone never fires for those.
async function normalizeCatastrophicSsrResponse(response: Response): Promise<Response> {
  if (response.status < 500) return response;
  const contentType = response.headers.get("content-type") ?? "";
  if (!contentType.includes("application/json")) return response;

  const body = await response.clone().text();
  if (!isH3SwallowedErrorBody(body)) return response;

  console.error(consumeLastCapturedError() ?? new Error(`h3 swallowed SSR error: ${body}`));
  return new Response(renderErrorPage(), {
    status: 500,
    headers: { "content-type": "text/html; charset=utf-8" },
  });
}

function isH3SwallowedErrorBody(body: string): boolean {
  try {
    const payload = JSON.parse(body) as { unhandled?: unknown; message?: unknown };
    return payload.unhandled === true && payload.message === "HTTPError";
  } catch {
    return false;
  }
}

const handler = {
  async fetch(request: Request, env: unknown, ctx: unknown) {
    try {
      // Cache Rules on the zone do not reach this response: on a Workers custom
      // domain the Worker *is* the origin, so its HTML never passes through the
      // CDN cache — /media and /assets get `cf-cache-status: HIT`, the rendered
      // pages get no such header at all. Caching therefore has to happen here.
      const cache = edgeCache();
      const cacheable = !!cache && isCacheable(request);
      const cacheKey = new Request(new URL(request.url).toString(), { method: "GET" });

      if (cacheable) {
        const hit = await cache!.match(cacheKey);
        if (hit) return hit;
      }

      const serverEntry = await getServerEntry();
      const response = await serverEntry.fetch(request, env, ctx);
      const normalized = await normalizeCatastrophicSsrResponse(response);
      const final = withSecurityHeaders(withPublicCache(request, normalized));

      if (cacheable && final.status === 200) {
        // Buffered on purpose. Handing `cache.put` the streamed SSR body stored
        // nothing retrievable — every subsequent request still missed — because
        // the stream is consumed by the response the visitor is already
        // receiving. These pages are ~66 KB, so reading them into memory first
        // costs nothing and gives the cache a complete body to keep.
        const body = await final.arrayBuffer();
        const cached = new Response(body, { status: 200, headers: final.headers });
        const ctxLike = ctx as { waitUntil?: (p: Promise<unknown>) => void } | undefined;
        const stored = cache!.put(cacheKey, cached.clone());
        if (ctxLike?.waitUntil) ctxLike.waitUntil(stored);
        else await stored;
        return cached;
      }
      return final;
    } catch (error) {
      // Caught here, so it never propagates to Sentry's own worker handler.
      Sentry.captureException(error);
      console.error(error);
      return withSecurityHeaders(
        new Response(renderErrorPage(), {
          status: 500,
          headers: { "content-type": "text/html; charset=utf-8" },
        }),
      );
    }
  },
};

/**
 * The Nitro build targets `cloudflare-module`, so server reporting uses
 * `@sentry/cloudflare` — `@sentry/node` (and `@sentry/tanstackstart-react`,
 * which depends on it) cannot run in the Workers runtime.
 *
 * `withSentry` reads the DSN from the worker's own env binding rather than
 * `process.env`, and stays inert when it is unset.
 */
export default Sentry.withSentry(
  (env: { SENTRY_DSN?: string; SENTRY_ENVIRONMENT?: string }) => ({
    dsn: env?.SENTRY_DSN,
    environment: env?.SENTRY_ENVIRONMENT ?? "production",
    tracesSampleRate: 0,
    sendDefaultPii: false,
  }),
  handler as Parameters<typeof Sentry.withSentry>[1],
);
