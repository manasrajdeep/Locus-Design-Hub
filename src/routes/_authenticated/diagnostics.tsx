import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { RlsAuditPanel } from "@/components/RlsAuditPanel";

import { CheckCircle2, XCircle, Loader2, RefreshCw } from "lucide-react";

export const Route = createFileRoute("/_authenticated/diagnostics")({
  ssr: false,
  head: () => ({
    meta: [
      { title: "Backend Diagnostics — Locus Design" },
      { name: "robots", content: "noindex, nofollow" },
    ],
  }),
  component: DiagnosticsPage,
});

type Check = { label: string; ok: boolean | null; detail: string };

function maskKey(key: string | undefined) {
  if (!key) return "missing";
  if (key.length <= 16) return `${key.slice(0, 4)}…`;
  return `${key.slice(0, 12)}…${key.slice(-4)}`;
}

function DiagnosticsPage() {
  const [checks, setChecks] = useState<Check[] | null>(null);
  const [runId, setRunId] = useState(0);

  const url = import.meta.env.VITE_SUPABASE_URL as string | undefined;
  const projectId = import.meta.env.VITE_SUPABASE_PROJECT_ID as string | undefined;
  const publishableKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY as string | undefined;

  useEffect(() => {
    let cancelled = false;

    (async () => {
      setChecks(null);
      const results: Check[] = [];

      results.push({
        label: "Environment variables",
        ok: Boolean(url && projectId && publishableKey),
        detail:
          url && projectId && publishableKey
            ? "All required values present"
            : "One or more values missing",
      });

      try {
        const started = performance.now();
        const { error } = await supabase.from("homepage_content").select("id").limit(1);
        const ms = Math.round(performance.now() - started);
        results.push({
          label: "Database (public read)",
          ok: !error,
          detail: error ? error.message : `Responded in ${ms}ms`,
        });
      } catch (e) {
        results.push({ label: "Database (public read)", ok: false, detail: (e as Error).message });
      }

      try {
        const { data, error } = await supabase.auth.getSession();
        results.push({
          label: "Auth service",
          ok: !error,
          detail: error
            ? error.message
            : data.session
              ? "Reachable — active session"
              : "Reachable — no active session",
        });
      } catch (e) {
        results.push({ label: "Auth service", ok: false, detail: (e as Error).message });
      }

      if (!cancelled) setChecks(results);
    })();

    return () => {
      cancelled = true;
    };
  }, [runId, url, projectId, publishableKey]);

  const rows = [
    { label: "Backend URL", value: url ?? "missing" },
    { label: "Project reference", value: projectId ?? "missing" },
    { label: "Publishable key", value: maskKey(publishableKey) },
    {
      label: "Key format",
      value: publishableKey?.startsWith("sb_publishable_")
        ? "new (sb_publishable_)"
        : publishableKey
          ? "legacy JWT"
          : "unknown",
    },
    { label: "App mode", value: import.meta.env.MODE },
    { label: "Origin", value: typeof window !== "undefined" ? window.location.origin : "—" },
  ];

  return (
    <main className="mx-auto w-full max-w-3xl px-4 py-16 md:px-6">
      <p className="eyebrow">Diagnostics</p>
      <h1 className="mt-3 text-3xl text-foreground md:text-4xl">Backend connection</h1>
      <p className="mt-3 text-sm text-muted-foreground">
        Confirms which backend this deployment talks to and whether the database and auth services
        respond.
      </p>

      <section className="mt-10 rounded-lg border border-border">
        <div className="flex items-center justify-between border-b border-border px-5 py-3">
          <h2 className="text-sm font-medium text-foreground">Live checks</h2>
          <button
            onClick={() => setRunId((n) => n + 1)}
            className="inline-flex items-center gap-2 rounded-md px-2.5 py-1.5 text-xs text-muted-foreground transition hover:bg-muted hover:text-foreground"
          >
            <RefreshCw className="h-3.5 w-3.5" /> Re-run
          </button>
        </div>
        <ul className="divide-y divide-border">
          {(checks ?? [{ label: "Running checks", ok: null, detail: "Please wait…" }]).map((c) => (
            <li key={c.label} className="flex items-start gap-3 px-5 py-4">
              {c.ok === null ? (
                <Loader2 className="mt-0.5 h-4 w-4 animate-spin text-muted-foreground" />
              ) : c.ok ? (
                <CheckCircle2 className="mt-0.5 h-4 w-4 text-emerald-600" />
              ) : (
                <XCircle className="mt-0.5 h-4 w-4 text-destructive" />
              )}
              <div>
                <p className="text-sm text-foreground">{c.label}</p>
                <p className="mt-0.5 text-xs text-muted-foreground">{c.detail}</p>
              </div>
            </li>
          ))}
        </ul>
      </section>

      <section className="mt-8 rounded-lg border border-border">
        <div className="border-b border-border px-5 py-3">
          <h2 className="text-sm font-medium text-foreground">Environment</h2>
        </div>
        <dl className="divide-y divide-border">
          {rows.map((r) => (
            <div
              key={r.label}
              className="flex flex-col gap-1 px-5 py-3 sm:flex-row sm:items-center sm:justify-between"
            >
              <dt className="text-sm text-muted-foreground">{r.label}</dt>
              <dd className="break-all font-mono text-xs text-foreground">{r.value}</dd>
            </div>
          ))}
        </dl>
      </section>

      <RlsAuditPanel />

      <p className="mt-6 text-xs text-muted-foreground">
        Secret keys are never exposed here — the publishable key is shown partially masked for
        identification only.
      </p>
    </main>
  );
}
