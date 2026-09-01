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
      const serverEntry = await getServerEntry();
      const response = await serverEntry.fetch(request, env, ctx);
      const normalized = await normalizeCatastrophicSsrResponse(response);
      return withSecurityHeaders(withPublicCache(request, normalized));
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
