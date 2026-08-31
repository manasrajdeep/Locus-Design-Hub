import { defineTool } from "@lovable.dev/mcp-js";
import { z } from "zod";
import { supabaseForUser, unauthenticated } from "../supabase";

export default defineTool({
  name: "list_project_messages",
  title: "List project messages",
  description: "Read the most recent chat messages on a project thread, newest last.",
  inputSchema: {
    project_id: z.string().describe("The project id (uuid) from list_projects."),
    limit: z
      .number()
      .int()
      .describe("How many recent messages to return (defaults to 30, capped at 100)."),
  },
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  handler: async ({ project_id, limit }, ctx) => {
    if (!ctx.isAuthenticated()) return unauthenticated();
    const take = Math.min(Math.max(Number.isFinite(limit) ? limit : 30, 1), 100);
    const supabase = supabaseForUser(ctx);
    const { data, error } = await supabase
      .from("messages")
      .select("id, body, sender_id, created_at")
      .eq("project_id", project_id)
      .order("created_at", { ascending: false })
      .limit(take);
    if (error) return { content: [{ type: "text", text: error.message }], isError: true };
    const messages = (data ?? [])
      .slice()
      .reverse()
      .map((m) => ({
        ...m,
        from_me: m.sender_id === ctx.getUserId(),
      }));
    return {
      content: [{ type: "text", text: JSON.stringify(messages) }],
      structuredContent: { messages },
    };
  },
});
