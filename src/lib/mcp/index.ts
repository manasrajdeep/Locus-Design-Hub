import { auth, defineMcp } from "@lovable.dev/mcp-js";
import listProjects from "./tools/list-projects";
import getProject from "./tools/get-project";
import listMessages from "./tools/list-messages";
import sendMessage from "./tools/send-message";

// The OAuth issuer must be the direct Supabase host; the project ref is the only
// value that survives publish unchanged.
const projectRef = import.meta.env["VITE_SUPABASE_PROJECT_ID"] ?? "project-ref-unset";

export default defineMcp({
  name: "locus-design-hub",
  title: "Locus Design Hub",
  version: "0.1.0",
  instructions:
    "Tools for the Locus Design client portal. Use `list_projects` to find a project, `get_project` for milestones, documents and progress photos, `list_project_messages` to read the project chat, and `send_project_message` to reply. All access is scoped to the signed-in user's own projects.",
  auth: auth.oauth.issuer({
    issuer: `https://${projectRef}.supabase.co/auth/v1`,
    acceptedAudiences: "authenticated",
  }),
  tools: [listProjects, getProject, listMessages, sendMessage],
});
