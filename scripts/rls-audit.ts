/**
 * Headless runner for the RLS isolation audit.
 *
 *   bun run scripts/rls-audit.ts
 *
 * Requires server env: SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, SUPABASE_SERVICE_ROLE_KEY.
 * Exits with code 1 when any cross-tenant access check fails, so it can gate CI.
 */
import { runRlsAudit } from "../src/lib/rls-audit.server";

const report = await runRlsAudit();

for (const c of report.checks) {
  console.log(
    `${c.ok ? "PASS" : "FAIL"}  [${c.group}] ${c.label} — expected ${c.expected}, got ${c.actual}`,
  );
}
console.log(
  `\n${report.passed} passed, ${report.failed} failed in ${(report.durationMs / 1000).toFixed(1)}s` +
    `${report.cleanupOk ? "" : " (cleanup incomplete)"}`,
);
if (report.error) console.error(`Audit error: ${report.error}`);

process.exit(report.failed === 0 && !report.error ? 0 : 1);
