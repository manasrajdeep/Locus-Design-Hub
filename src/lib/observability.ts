/**
 * Browser error reporting.
 *
 * Until now a crash in production was invisible: the root error boundary
 * rendered a friendly page and the only reporting hook (`__lovableEvents`)
 * exists solely inside the editor preview, so nothing left the browser.
 *
 * Everything here is inert unless `VITE_SENTRY_DSN` is set, so an unconfigured
 * or misconfigured deploy degrades to exactly the previous behaviour rather
 * than breaking the page.
 *
 * Server-side reporting is separate: the Nitro build targets
 * `cloudflare-module`, so the worker uses `@sentry/cloudflare` in src/server.ts.
 * `@sentry/node` — and therefore `@sentry/tanstackstart-react`, which depends on
 * it — cannot run in that runtime.
 */
import * as Sentry from "@sentry/react";

const DSN = import.meta.env["VITE_SENTRY_DSN"] as string | undefined;

/**
 * Traces are off by default. This is an error tracker first; sampling traces on
 * a client portal means shipping URLs and timings for every session, which is a
 * cost and privacy decision the owner should make deliberately.
 */
const TRACES_SAMPLE_RATE = Number(import.meta.env["VITE_SENTRY_TRACES_SAMPLE_RATE"] ?? 0);

let started = false;

export function initBrowserObservability(): void {
  if (started || !DSN || typeof window === "undefined") return;
  started = true;

  Sentry.init({
    dsn: DSN,
    environment: import.meta.env.MODE,
    tracesSampleRate: Number.isFinite(TRACES_SAMPLE_RATE) ? TRACES_SAMPLE_RATE : 0,
    // Session Replay is deliberately not enabled: this app renders client
    // contracts, invoices and private project chat, so recording sessions needs
    // an explicit decision about scrubbing before it goes anywhere near it.
    sendDefaultPii: false,
    beforeSend(event) {
      // Supabase access tokens ride in query strings on storage URLs; keep them
      // out of the issue payload.
      if (event.request?.url) {
        event.request.url = event.request.url.replace(
          /([?&](token|apikey)=)[^&]+/gi,
          "$1[redacted]",
        );
      }
      return event;
    },
  });
}

/** True when a DSN was configured and Sentry actually started. */
export function observabilityEnabled(): boolean {
  return started;
}

export { Sentry };
