import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import type { SubmitOutcome } from "./search-submit.server";

/**
 * Staff-only: re-submit the (dynamically generated) sitemap to Google and Bing.
 * The caller's role is verified through their own session, never service-role.
 */
export const submitSitemapFn = createServerFn({ method: "POST" })
  .inputValidator((data: { siteUrl?: string } | undefined) => data ?? {})
  .middleware([requireSupabaseAuth])
  .handler(async ({ context, data }): Promise<SubmitOutcome[]> => {
    const { data: roles, error } = await context.supabase
      .from("user_roles")
      .select("role")
      .eq("user_id", context.userId);
    if (error) throw new Error(`Could not verify role: ${error.message}`);
    if (!roles?.some((r) => r.role === "admin" || r.role === "superadmin")) {
      throw new Response("Forbidden", { status: 403 });
    }

    const { submitSitemapEverywhere } = await import("./search-submit.server");
    return submitSitemapEverywhere(data.siteUrl);
  });
