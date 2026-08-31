import { QueryClient } from "@tanstack/react-query";
import { createRouter } from "@tanstack/react-router";
import { routeTree } from "./routeTree.gen";
import { initBrowserObservability } from "./lib/observability";

export const getRouter = () => {
  // This project has no separate client entry, and getRouter() is the first
  // app code to run in the browser — so it is where error reporting starts.
  // No-ops on the server and when VITE_SENTRY_DSN is unset.
  initBrowserObservability();

  const queryClient = new QueryClient();

  const router = createRouter({
    routeTree,
    context: { queryClient },
    scrollRestoration: true,
    defaultPreloadStaleTime: 0,
  });

  return router;
};
