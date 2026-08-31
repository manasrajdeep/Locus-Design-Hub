import { defineTool } from "@lovable.dev/mcp-js";
import { z } from "zod";
import { supabaseForUser, unauthenticated } from "../supabase";

export default defineTool({
  name: "get_project",
  title: "Get project detail",
  description:
    "Get one project's milestones, recent activity log, documents and progress photos. Use list_projects first to find the project id.",
  inputSchema: { project_id: z.string().describe("The project id (uuid) from list_projects.") },
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  handler: async ({ project_id }, ctx) => {
    if (!ctx.isAuthenticated()) return unauthenticated();
    const supabase = supabaseForUser(ctx);

    const { data: project, error } = await supabase
      .from("projects")
      .select("id, name, address, current_milestone, milestones, created_at")
      .eq("id", project_id)
      .maybeSingle();
    if (error) return { content: [{ type: "text", text: error.message }], isError: true };
    if (!project) {
      return {
        content: [{ type: "text", text: "Project not found or not accessible." }],
        isError: true,
      };
    }

    const [activity, documents, updates] = await Promise.all([
      supabase
        .from("project_activity")
        .select("action, milestone, from_status, to_status, actor_name, created_at")
        .eq("project_id", project_id)
        .order("created_at", { ascending: false })
        .limit(20),
      supabase
        .from("project_documents")
        .select("id, name, kind, created_at")
        .eq("project_id", project_id)
        .order("created_at", { ascending: false })
        .limit(50),
      supabase
        .from("project_updates")
        .select("id, caption, image_url, created_at")
        .eq("project_id", project_id)
        .order("created_at", { ascending: false })
        .limit(20),
    ]);

    const result = {
      project,
      activity: activity.data ?? [],
      documents: documents.data ?? [],
      photos: updates.data ?? [],
    };
    return {
      content: [{ type: "text", text: JSON.stringify(result) }],
      structuredContent: result,
    };
  },
});
