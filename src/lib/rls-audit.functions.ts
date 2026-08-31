import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import type { RlsAuditReport } from "./rls-audit.server";

/**
 * Superadmin-only trigger for the automated RLS isolation audit.
 * The caller's role is verified through their own session (RLS applies),
 * never through the service-role client.
 */
export const runRlsAuditFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<RlsAuditReport> => {
    const { data: roles, error } = await context.supabase
      .from("user_roles")
      .select("role")
      .eq("user_id", context.userId);
    if (error) throw new Error(`Could not verify role: ${error.message}`);
    if (!roles?.some((r) => r.role === "superadmin")) {
      throw new Response("Forbidden", { status: 403 });
    }

    const { runRlsAudit } = await import("./rls-audit.server");
    return runRlsAudit();
  });
