import { defineTool } from "@lovable.dev/mcp-js";
import { z } from "zod";
import { supabaseForUser, unauthenticated } from "../supabase";

export default defineTool({
  name: "send_project_message",
  title: "Send project message",
  description: "Post a chat message to a project thread as the signed-in user.",
  inputSchema: {
    project_id: z.string().describe("The project id (uuid) from list_projects."),
    body: z.string().describe("Message text. Keep it under 2000 characters."),
  },
  annotations: { readOnlyHint: false, destructiveHint: false, openWorldHint: false },
  handler: async ({ project_id, body }, ctx) => {
    if (!ctx.isAuthenticated()) return unauthenticated();
    const text = body.trim().slice(0, 2000);
    if (!text)
      return { content: [{ type: "text", text: "Message body is empty." }], isError: true };
    const supabase = supabaseForUser(ctx);
    const { data, error } = await supabase
      .from("messages")
      .insert({ project_id, body: text, sender_id: ctx.getUserId()! })
      .select("id, body, created_at")
      .maybeSingle();
    if (error) return { content: [{ type: "text", text: error.message }], isError: true };
    return {
      content: [{ type: "text", text: `Message sent: ${JSON.stringify(data)}` }],
      structuredContent: { message: data },
    };
  },
});
