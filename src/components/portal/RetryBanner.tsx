import { formatTime, useLangTick } from "@/lib/i18n-format";
import { AlertTriangle, RefreshCw, X, Loader2 } from "lucide-react";
import { toast } from "sonner";
import {
  useFailedTasks,
  retryTask,
  retryAllTasks,
  dismissTask,
  clearFailedTasks,
} from "@/lib/portal-retry";

/**
 * Shows anything that failed (photo upload, document, message, live connection)
 * with a per-item Retry so the client never has to reload the portal.
 */
export function RetryBanner() {
  useLangTick();
  const tasks = useFailedTasks();
  if (!tasks.length) return null;
  const busy = tasks.some((t) => t.retrying);

  return (
    <section
      role="alert"
      aria-label="Failed actions"
      className="mt-6 rounded-lg border border-destructive/40 bg-destructive/5 p-4"
    >
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="inline-flex items-center gap-2 text-sm font-medium text-foreground">
          <AlertTriangle className="h-4 w-4 text-destructive" />
          {tasks.length === 1
            ? "1 action didn’t go through"
            : `${tasks.length} actions didn’t go through`}
        </p>
        <div className="flex items-center gap-2">
          <button
            onClick={async () => {
              const ok = await retryAllTasks();
              if (ok) toast.success(ok === 1 ? "Retry succeeded" : `${ok} actions completed`);
              else
                toast.error("Still failing", {
                  description: "Check your connection and try again.",
                });
            }}
            disabled={busy}
            className="inline-flex items-center gap-2 rounded-md bg-foreground px-3 py-1.5 text-xs text-background disabled:opacity-50"
          >
            {busy ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <RefreshCw className="h-3.5 w-3.5" />
            )}
            Retry all
          </button>
          <button
            onClick={() => clearFailedTasks()}
            className="rounded-md border border-border px-3 py-1.5 text-xs text-muted-foreground hover:text-foreground"
          >
            Dismiss all
          </button>
        </div>
      </div>

      <ul className="mt-3 space-y-2">
        {tasks.map((t) => (
          <li
            key={t.id}
            className="flex flex-wrap items-center justify-between gap-3 rounded-md border border-border bg-card px-3 py-2"
          >
            <div className="min-w-0">
              <p className="truncate text-sm text-foreground">{t.label}</p>
              <p className="truncate text-xs text-muted-foreground">
                {t.error} · {formatTime(t.failedAt)}
              </p>
            </div>
            <div className="flex items-center gap-1.5">
              <button
                onClick={async () => {
                  const ok = await retryTask(t.id);
                  if (ok) toast.success("Retry succeeded", { description: t.label });
                  else toast.error("Retry failed", { description: t.label });
                }}
                disabled={t.retrying}
                className="inline-flex items-center gap-1.5 rounded-md border border-border px-2.5 py-1.5 text-xs text-foreground disabled:opacity-50"
              >
                {t.retrying ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <RefreshCw className="h-3.5 w-3.5" />
                )}
                Retry
              </button>
              <button
                onClick={() => dismissTask(t.id)}
                aria-label={`Dismiss ${t.label}`}
                className="rounded-md p-1.5 text-muted-foreground hover:text-foreground"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}
