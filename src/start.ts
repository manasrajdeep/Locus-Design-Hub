import { createStart, createCsrfMiddleware, createMiddleware } from "@tanstack/react-start";
import * as Sentry from "@sentry/cloudflare";

import { renderErrorPage } from "./lib/error-page";
import { attachSupabaseAuth } from "@/integrations/supabase/auth-attacher";

const errorMiddleware = createMiddleware().server(async ({ next }) => {
  try {
    return await next();
  } catch (error) {
    // Redirects and other framework control-flow throws carry a statusCode;
    // they are not failures and must not be reported.
    if (error != null && typeof error === "object" && "statusCode" in error) {
      throw error;
    }
    // Swallowed into a 500 page below, so Sentry only sees it if we say so.
    Sentry.captureException(error);
    console.error(error);
    return new Response(renderErrorPage(), {
      status: 500,
      headers: { "content-type": "text/html; charset=utf-8" },
    });
  }
});

// Start installs this automatically when src/start.ts is absent; defining the
// file opts out, so re-add it explicitly to keep server functions protected
// from cross-site requests.
const csrfMiddleware = createCsrfMiddleware({
  filter: (ctx) => ctx.handlerType === "serverFn",
});

export const startInstance = createStart(() => ({
  functionMiddleware: [attachSupabaseAuth],
  requestMiddleware: [errorMiddleware, csrfMiddleware],
}));
