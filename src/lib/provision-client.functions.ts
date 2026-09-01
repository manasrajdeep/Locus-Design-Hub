import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import type { ProvisionInput, ProvisionResult } from "./provision-client.server";

/**
 * Staff-only: create a client account with a password set by the admin.
 *
 * The role is verified through the caller's own session, where row-level
 * security applies — never through the service-role client, which would happily
 * confirm any role for anyone. Only after that check does the handler reach for
 * the privileged client.
 */
export const provisionClientFn = createServerFn({ method: "POST" })
  .inputValidator((data: ProvisionInput) => data)
  .middleware([requireSupabaseAuth])
  .handler(async ({ context, data }): Promise<ProvisionResult> => {
    const { data: roles, error } = await context.supabase
      .from("user_roles")
      .select("role")
      .eq("user_id", context.userId);
    if (error) throw new Error(`Could not verify role: ${error.message}`);
    if (!roles?.some((r) => r.role === "admin" || r.role === "superadmin")) {
      throw new Response("Forbidden", { status: 403 });
    }

    const { provisionClient } = await import("./provision-client.server");
    return provisionClient(data);
  });
