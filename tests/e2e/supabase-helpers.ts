import { createClient, type SupabaseClient } from "@supabase/supabase-js";

/**
 * Which Supabase project the end-to-end suite talks to.
 *
 * Two very different things happen in this suite:
 *
 *  - Read-only assertions about the rendered homepage, which are happy to run
 *    against whatever project the app under test is using.
 *  - Destructive seeding with a service-role key: tenant-isolation provisions
 *    real users, projects and storage objects, and superadmin-cms creates a
 *    superadmin and rewrites `homepage_content`.
 *
 * The second kind must never touch production. So the service-role credentials
 * are read *only* from the disposable-project variables, with no fallback to
 * the app's own `SUPABASE_SERVICE_ROLE_KEY` — setting that alone will not arm
 * the destructive specs, it will skip them.
 *
 * playwright.config.ts points the dev server at the same disposable project, so
 * the browser-level assertions in those specs see the data that was seeded.
 */
const disposableUrl =
  process.env["E2E_SUPABASE_URL"] ?? process.env["RLS_AUDIT_SUPABASE_URL"] ?? "";
const disposableKey =
  process.env["E2E_SUPABASE_PUBLISHABLE_KEY"] ??
  process.env["RLS_AUDIT_SUPABASE_PUBLISHABLE_KEY"] ??
  "";
const disposableServiceKey =
  process.env["E2E_SUPABASE_SERVICE_ROLE_KEY"] ??
  process.env["RLS_AUDIT_SUPABASE_SERVICE_ROLE_KEY"] ??
  "";

const usingDisposableProject = Boolean(disposableUrl && disposableKey);

// Read-only specs fall back to the ambient project so homepage coverage keeps
// working when no disposable project is configured.
const url =
  (usingDisposableProject ? disposableUrl : "") ||
  process.env["SUPABASE_URL"] ||
  process.env["VITE_SUPABASE_URL"] ||
  "";
const publishableKey =
  (usingDisposableProject ? disposableKey : "") ||
  process.env["SUPABASE_PUBLISHABLE_KEY"] ||
  process.env["VITE_SUPABASE_PUBLISHABLE_KEY"] ||
  "";

export const SUPABASE_URL = url;
export const SUPABASE_PUBLISHABLE_KEY = publishableKey;

/** True only when seeding is pointed at a disposable project, never production. */
export const hasServiceRole = Boolean(
  usingDisposableProject && disposableUrl && disposableServiceKey,
);
export const hasPublicApi = Boolean(url && publishableKey);

/** Explains, in a skip message, why the destructive specs are not running. */
export const seedTargetReason = usingDisposableProject
  ? disposableServiceKey
    ? ""
    : "E2E_SUPABASE_SERVICE_ROLE_KEY (or RLS_AUDIT_SUPABASE_SERVICE_ROLE_KEY) is not set"
  : "no disposable project configured — set E2E_SUPABASE_URL/_PUBLISHABLE_KEY/_SERVICE_ROLE_KEY " +
    "(or the RLS_AUDIT_* equivalents). These specs seed and delete real records, so they never " +
    "run against the app's own project.";

/**
 * Service-role client for the disposable project — tests only.
 *
 * Connects with `disposableUrl`, not the resolved `url`, so that even if the
 * read-only fallback ever pointed at the app's project, seeding could not.
 */
export function adminClient(): SupabaseClient {
  if (!hasServiceRole) throw new Error(`Destructive specs are not armed: ${seedTargetReason}`);
  return createClient(disposableUrl, disposableServiceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

/** Anon (publishable-key) client, same access level as the browser has. */
export function anonClient(): SupabaseClient {
  return createClient(url, publishableKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

/** Signs a seeded user in and returns their access token. */
export async function signInToken(email: string, password: string): Promise<string> {
  const { data, error } = await anonClient().auth.signInWithPassword({ email, password });
  if (error || !data.session) throw new Error(`sign-in failed for ${email}: ${error?.message}`);
  return data.session.access_token;
}

/** Raw Data API request as a given user — mirrors exactly what the browser can do. */
export async function restAs(
  token: string,
  pathAndQuery: string,
  init: RequestInit = {},
): Promise<{ status: number; body: unknown }> {
  const res = await fetch(`${url}/rest/v1/${pathAndQuery}`, {
    ...init,
    headers: {
      apikey: publishableKey,
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      Prefer: "return=representation",
      ...(init.headers ?? {}),
    },
  });
  let body: unknown = null;
  try {
    body = await res.json();
  } catch {
    body = null;
  }
  return { status: res.status, body };
}

export type SeededTenant = {
  label: string;
  email: string;
  password: string;
  userId: string;
  projectId: string;
  token: string;
  photoPath: string;
  docPath: string;
  secret: string;
};

const TAG = "pw-isolation";

/** Creates a confirmed customer with a project, activity row, photo, document and message. */
export async function seedTenant(label: string): Promise<SeededTenant> {
  const admin = adminClient();
  const stamp = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const email = `${TAG}-${label}-${stamp}@example.com`;
  const password = `Pw!${stamp}Aa1`;
  const secret = `SECRET-${label}-${stamp}`;

  const { data: created, error: userErr } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { full_name: `${TAG} ${label}` },
  });
  if (userErr || !created.user) throw new Error(`createUser failed: ${userErr?.message}`);
  const userId = created.user.id;

  const { data: project, error: projErr } = await admin
    .from("projects")
    .insert({
      customer_id: userId,
      name: `${secret} project`,
      address: `${secret} address`,
      current_milestone: 1,
    })
    .select("id")
    .single();
  if (projErr || !project) throw new Error(`project insert failed: ${projErr?.message}`);
  const projectId = project.id as string;

  const photoPath = `${projectId}/${TAG}-photo-${stamp}.jpg`;
  const docPath = `${projectId}/${TAG}-doc-${stamp}.pdf`;

  await admin.storage
    .from("project-images")
    .upload(photoPath, new Blob([`photo ${secret}`], { type: "image/jpeg" }), { upsert: true });
  await admin.storage
    .from("project-documents")
    .upload(docPath, new Blob([`doc ${secret}`], { type: "application/pdf" }), { upsert: true });

  await admin.from("project_activity").insert({
    project_id: projectId,
    actor_name: `${TAG} ${label}`,
    action: "status_change",
    milestone: `${secret} milestone`,
    to_status: "in_progress",
  });
  await admin
    .from("project_updates")
    .insert({ project_id: projectId, image_url: photoPath, caption: `${secret} caption` });
  await admin
    .from("project_documents")
    .insert({ project_id: projectId, name: `${secret}.pdf`, file_path: docPath, kind: "contract" });
  await admin
    .from("messages")
    .insert({ project_id: projectId, sender_id: userId, body: `${secret} message` });

  const token = await signInToken(email, password);
  return { label, email, password, userId, projectId, token, photoPath, docPath, secret };
}

export async function cleanupTenant(tenant: SeededTenant) {
  const admin = adminClient();
  await admin.storage.from("project-images").remove([tenant.photoPath]);
  await admin.storage.from("project-documents").remove([tenant.docPath]);
  await admin.from("messages").delete().eq("project_id", tenant.projectId);
  await admin.from("project_documents").delete().eq("project_id", tenant.projectId);
  await admin.from("project_updates").delete().eq("project_id", tenant.projectId);
  await admin.from("project_activity").delete().eq("project_id", tenant.projectId);
  await admin.from("projects").delete().eq("id", tenant.projectId);
  await admin.auth.admin.deleteUser(tenant.userId);
}
