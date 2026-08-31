/**
 * Forwards React error-boundary failures to the editor preview's telemetry.
 *
 * Production React does not rethrow boundary-caught errors to window.onerror,
 * so the preview harness never sees them unless we forward them explicitly.
 *
 * In production this reports to Sentry (when VITE_SENTRY_DSN is configured).
 * The editor-preview hook below it stays behind `import.meta.env.DEV`, which
 * Vite replaces with `false` in a production build — that branch and every
 * identifier inside it are then dropped by dead-code elimination, so nothing
 * about the authoring tooling ships to visitors.
 */
import { Sentry } from "./observability";

type ReportOptions = {
  mechanism?: "manual" | "onerror" | "unhandledrejection" | "react_error_boundary";
  handled?: boolean;
  severity?: "error" | "warning" | "info";
};

type PreviewTelemetry = {
  captureException?: (
    error: unknown,
    context?: Record<string, unknown>,
    options?: ReportOptions,
  ) => void;
};

type PreviewHost = {
  __lovableEvents?: PreviewTelemetry;
  __lovableReportRuntimeError?: (payload: {
    message: string;
    stack?: string;
    filename?: string;
  }) => void;
};

/** Loaders and server fns commonly throw a raw Response; String(it) would be
 *  the opaque "[object Response]", so pull out the status and URL instead. */
function describe(error: unknown): string {
  if (error instanceof Response) {
    return `Response ${error.status}${error.url ? ` at ${error.url}` : ""}`;
  }
  return error instanceof Error ? error.message : String(error);
}

export function reportClientError(error: unknown, context: Record<string, unknown> = {}) {
  if (typeof window === "undefined") return;

  // The root error boundary renders a friendly page instead of rethrowing, so
  // nothing reaches Sentry's global handlers on its own — report explicitly or
  // production crashes stay invisible.
  Sentry.captureException(error, {
    tags: { source: "react_error_boundary" },
    extra: { route: window.location.pathname, ...context },
  });

  if (!import.meta.env.DEV) return;

  const host = window as unknown as PreviewHost;

  host.__lovableEvents?.captureException?.(
    error,
    { source: "react_error_boundary", route: window.location.pathname, ...context },
    { mechanism: "react_error_boundary", handled: false, severity: "error" },
  );

  host.__lovableReportRuntimeError?.({
    message: describe(error),
    stack: error instanceof Error ? error.stack : undefined,
    filename: window.location.pathname,
  });
}
