import { useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { CheckCircle2, XCircle, Loader2, ShieldCheck } from "lucide-react";
import { runRlsAuditFn } from "@/lib/rls-audit.functions";
import type { RlsAuditReport, RlsCheck } from "@/lib/rls-audit.server";

const GROUP_LABEL: Record<RlsCheck["group"], string> = {
  projects: "Projects & profiles",
  milestones: "Milestones",
  photos: "Site photos",
  documents: "Documents",
  chat: "Chat",
  storage: "Private storage",
};

export function RlsAuditPanel() {
  const run = useServerFn(runRlsAuditFn);
  const [busy, setBusy] = useState(false);
  const [report, setReport] = useState<RlsAuditReport | null>(null);
  const [failure, setFailure] = useState<string | null>(null);

  const start = async () => {
    setBusy(true);
    setFailure(null);
    try {
      setReport(await run());
    } catch (e) {
      const msg = (e as Error).message ?? "Audit failed";
      const denied = /403|Forbidden|Unauthorized|authorization header/i.test(msg);
      setFailure(denied ? "Sign in as a superadmin to run this audit." : msg);
      setReport(null);
    } finally {
      setBusy(false);
    }
  };

  const groups = report
    ? (Object.keys(GROUP_LABEL) as RlsCheck["group"][])
        .map((g) => ({
          group: g,
          checks: report.checks.filter((c) => c.group === g),
        }))
        .filter((g) => g.checks.length > 0)
    : [];

  return (
    <section className="mt-8 rounded-lg border border-border">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border px-5 py-3">
        <div>
          <h2 className="flex items-center gap-2 text-sm font-medium text-foreground">
            <ShieldCheck className="h-4 w-4" /> Tenant isolation audit
          </h2>
          <p className="mt-0.5 text-xs text-muted-foreground">
            Creates two throwaway clients, then tries to read and write each other&apos;s
            milestones, photos, documents, chat and private files. Every attempt must be blocked.
          </p>
          <p className="mt-1 text-xs text-muted-foreground">
            Runs against the dedicated audit project set by <code>RLS_AUDIT_SUPABASE_URL</code> — it
            seeds and deletes real records, so it never touches production.
          </p>
        </div>
        <button
          onClick={start}
          disabled={busy}
          className="inline-flex items-center gap-2 rounded-md bg-primary px-3 py-2 text-xs font-medium text-primary-foreground transition hover:opacity-90 disabled:opacity-60"
        >
          {busy ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
          ) : (
            <ShieldCheck className="h-3.5 w-3.5" />
          )}
          {busy ? "Running audit…" : "Run isolation audit"}
        </button>
      </div>

      {failure && <p className="px-5 py-4 text-sm text-destructive">{failure}</p>}

      {/* A report with no checks means the audit never ran — reporting "isolation
          holds" there would be a green light nobody earned. */}
      {report && report.checks.length === 0 && (
        <p className="px-5 py-4 text-sm text-muted-foreground">
          <span className="font-medium text-foreground">The audit did not run.</span>{" "}
          {report.error ?? "No checks were executed."}
        </p>
      )}

      {report && report.checks.length > 0 && (
        <div>
          <div className="flex flex-wrap items-center gap-4 border-b border-border px-5 py-3 text-xs">
            <span
              className={
                report.failed === 0
                  ? "font-medium text-emerald-600"
                  : "font-medium text-destructive"
              }
            >
              {report.failed === 0 ? "Isolation holds" : `${report.failed} check(s) failed`}
            </span>
            <span className="text-muted-foreground">{report.passed} passed</span>
            <span className="text-muted-foreground">{(report.durationMs / 1000).toFixed(1)}s</span>
            <span className="text-muted-foreground">
              Test data cleanup: {report.cleanupOk ? "complete" : "needs attention"}
            </span>
          </div>
          {report.error && <p className="px-5 pt-3 text-xs text-destructive">{report.error}</p>}
          {groups.map(({ group, checks }) => (
            <div key={group}>
              <p className="bg-muted/40 px-5 py-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
                {GROUP_LABEL[group]}
              </p>
              <ul className="divide-y divide-border">
                {checks.map((c) => (
                  <li key={c.id} className="flex items-start gap-3 px-5 py-3">
                    {c.ok ? (
                      <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" />
                    ) : (
                      <XCircle className="mt-0.5 h-4 w-4 shrink-0 text-destructive" />
                    )}
                    <div className="min-w-0">
                      <p className="text-sm text-foreground">{c.label}</p>
                      <p className="mt-0.5 break-words text-xs text-muted-foreground">
                        expected {c.expected} · got {c.actual}
                      </p>
                    </div>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
