/**
 * Automated Row Level Security isolation audit.
 *
 * Provisions two throwaway customers, each with their own project plus one
 * milestone-activity row, one site photo, one document and one chat message.
 * It then signs in as each customer and attempts to read/write the OTHER
 * customer's data across every table and the private storage buckets.
 * Every cross-tenant attempt must return zero rows or an error.
 *
 * Runs against a DEDICATED audit project, never production.
 *
 * The audit is destructive by nature: it creates real `auth.users`, real
 * projects and real storage objects with a service-role key, then deletes them.
 * Pointed at production that means live customer tables accumulate test rows,
 * a failed run can leave orphaned users behind, and a bug in the cleanup path
 * deletes the wrong thing. So the connection comes from its own environment
 * variables and the run is refused outright if they are missing or if they
 * resolve to the same project the app itself is using.
 *
 * Configure (a throwaway Supabase project with these migrations applied):
 *   RLS_AUDIT_SUPABASE_URL
 *   RLS_AUDIT_SUPABASE_PUBLISHABLE_KEY
 *   RLS_AUDIT_SUPABASE_SERVICE_ROLE_KEY
 */
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";

export type RlsCheck = {
  id: string;
  group: "milestones" | "photos" | "documents" | "chat" | "projects" | "storage";
  label: string;
  expected: string;
  actual: string;
  ok: boolean;
};

export type RlsAuditReport = {
  ranAt: string;
  durationMs: number;
  passed: number;
  failed: number;
  checks: RlsCheck[];
  cleanupOk: boolean;
  error?: string;
};

type Client = SupabaseClient<Database>;

/** Raised when the audit is not safely configured; never surfaced as a check failure. */
class AuditNotConfigured extends Error {}

type AuditTarget = { url: string; publishableKey: string; admin: Client };

/** A Supabase URL identifies a project by its ref subdomain. */
function projectRef(url: string): string {
  try {
    return new URL(url).hostname.split(".")[0]!.toLowerCase();
  } catch {
    return url.trim().toLowerCase();
  }
}

/**
 * Resolves the audit project, refusing anything that could touch production.
 *
 * Deliberately reads only RLS_AUDIT_* variables — there is no fallback to the
 * app's own Supabase credentials, because a fallback is exactly how this ends
 * up seeding production again the next time the audit vars go missing.
 */
function auditTarget(): AuditTarget {
  const url = process.env["RLS_AUDIT_SUPABASE_URL"]?.trim();
  const publishableKey = process.env["RLS_AUDIT_SUPABASE_PUBLISHABLE_KEY"]?.trim();
  const serviceRoleKey = process.env["RLS_AUDIT_SUPABASE_SERVICE_ROLE_KEY"]?.trim();

  const missing = [
    ...(!url ? ["RLS_AUDIT_SUPABASE_URL"] : []),
    ...(!publishableKey ? ["RLS_AUDIT_SUPABASE_PUBLISHABLE_KEY"] : []),
    ...(!serviceRoleKey ? ["RLS_AUDIT_SUPABASE_SERVICE_ROLE_KEY"] : []),
  ];
  if (missing.length) {
    throw new AuditNotConfigured(
      `The isolation audit needs a dedicated Supabase project and is not configured: ${missing.join(", ")} ` +
        `not set. It seeds and deletes real users, projects and files, so it must never point at production.`,
    );
  }

  const appUrl = process.env.SUPABASE_URL?.trim();
  if (appUrl && projectRef(appUrl) === projectRef(url!)) {
    throw new AuditNotConfigured(
      `Refusing to run: RLS_AUDIT_SUPABASE_URL points at "${projectRef(url!)}", which is the project this app ` +
        `is serving. Point the audit at a separate throwaway project with the same migrations applied.`,
    );
  }

  const admin = createClient<Database>(url!, serviceRoleKey!, {
    global: {
      fetch: (input, init) => {
        const headers = new Headers(init?.headers);
        headers.set("apikey", serviceRoleKey!);
        return fetch(input, { ...init, headers });
      },
    },
    auth: { storage: undefined, persistSession: false, autoRefreshToken: false },
  });

  return { url: url!, publishableKey: publishableKey!, admin };
}

function userClient(target: AuditTarget, accessToken: string): Client {
  const { url, publishableKey: key } = target;
  return createClient<Database>(url, key, {
    global: {
      fetch: (input, init) => {
        const headers = new Headers(init?.headers);
        headers.set("apikey", key);
        headers.set("Authorization", `Bearer ${accessToken}`);
        return fetch(input, { ...init, headers });
      },
    },
    auth: { storage: undefined, persistSession: false, autoRefreshToken: false },
  });
}

async function signIn(target: AuditTarget, email: string, password: string) {
  const anon = createClient<Database>(target.url, target.publishableKey, {
    auth: { storage: undefined, persistSession: false, autoRefreshToken: false },
  });
  const { data, error } = await anon.auth.signInWithPassword({ email, password });
  if (error || !data.session)
    throw new Error(`Sign-in failed for ${email}: ${error?.message ?? "no session"}`);
  return data.session.access_token;
}

type Tenant = {
  label: string;
  userId: string;
  email: string;
  projectId: string;
  client: Client;
  photoPath: string;
  docPath: string;
};

const TEST_TAG = "rls-audit";

export async function runRlsAudit(): Promise<RlsAuditReport> {
  const started = Date.now();

  // Resolve the target first. A misconfigured audit must not reach the seeding
  // or cleanup paths at all, since both wield a service-role key.
  let target: AuditTarget;
  try {
    target = auditTarget();
  } catch (e) {
    if (!(e instanceof AuditNotConfigured)) throw e;
    return {
      ranAt: new Date().toISOString(),
      durationMs: Date.now() - started,
      passed: 0,
      failed: 0,
      checks: [],
      cleanupOk: true,
      error: e.message,
    };
  }
  const admin = target.admin;

  const checks: RlsCheck[] = [];
  const createdUsers: string[] = [];
  const createdProjects: string[] = [];
  const storagePaths: { bucket: string; path: string }[] = [];
  let cleanupOk = true;
  let error: string | undefined;

  const push = (c: RlsCheck) => checks.push(c);

  const expectEmpty = async (
    id: string,
    group: RlsCheck["group"],
    label: string,
    run: () => PromiseLike<{ data: unknown[] | null; error: { message: string } | null }>,
  ) => {
    try {
      const { data, error: err } = await run();
      const rows = data?.length ?? 0;
      push({
        id,
        group,
        label,
        expected: "0 rows or error",
        actual: err ? `blocked: ${err.message}` : `${rows} row(s) returned`,
        ok: Boolean(err) || rows === 0,
      });
    } catch (e) {
      push({
        id,
        group,
        label,
        expected: "0 rows or error",
        actual: `blocked: ${(e as Error).message}`,
        ok: true,
      });
    }
  };

  const expectRows = async (
    id: string,
    group: RlsCheck["group"],
    label: string,
    run: () => PromiseLike<{ data: unknown[] | null; error: { message: string } | null }>,
  ) => {
    try {
      const { data, error: err } = await run();
      const rows = data?.length ?? 0;
      push({
        id,
        group,
        label,
        expected: "at least 1 row",
        actual: err ? `error: ${err.message}` : `${rows} row(s) returned`,
        ok: !err && rows > 0,
      });
    } catch (e) {
      push({
        id,
        group,
        label,
        expected: "at least 1 row",
        actual: `error: ${(e as Error).message}`,
        ok: false,
      });
    }
  };

  try {
    // ---------- seed two isolated tenants ----------
    const stamp = Date.now();
    const seeds = await Promise.all(
      (["a", "b"] as const).map(async (suffix, i) => {
        const email = `${TEST_TAG}+${stamp}-${suffix}@locus-tests.invalid`;
        const password = `Aud1t-${stamp}-${suffix}-${Math.random().toString(36).slice(2, 10)}`;
        const { data, error: createErr } = await admin.auth.admin.createUser({
          email,
          password,
          email_confirm: true,
          user_metadata: {
            full_name: `RLS Audit Tenant ${suffix.toUpperCase()}`,
            [TEST_TAG]: true,
          },
        });
        if (createErr || !data.user)
          throw new Error(`Could not create audit user: ${createErr?.message}`);
        createdUsers.push(data.user.id);

        const { data: project, error: projErr } = await admin
          .from("projects")
          .insert({
            customer_id: data.user.id,
            name: `RLS Audit Project ${suffix.toUpperCase()}`,
            address: `${100 + i} Audit Lane`,
          })
          .select("id")
          .single();
        if (projErr || !project)
          throw new Error(`Could not create audit project: ${projErr?.message}`);
        createdProjects.push(project.id);

        const photoPath = `${project.id}/${TEST_TAG}-photo.txt`;
        const docPath = `${project.id}/${TEST_TAG}-doc.txt`;

        await Promise.all([
          admin.from("project_activity").insert({
            project_id: project.id,
            actor_name: "RLS Audit",
            action: "status_change",
            milestone: "Foundation",
            from_status: "pending",
            to_status: "in_progress",
          }),
          admin.from("project_updates").insert({
            project_id: project.id,
            image_url: `https://example.invalid/${TEST_TAG}-${suffix}.jpg`,
            caption: `Audit photo ${suffix}`,
          }),
          admin.from("project_documents").insert({
            project_id: project.id,
            name: `Audit doc ${suffix}`,
            file_path: docPath,
            kind: "other",
          }),
          admin.from("messages").insert({
            project_id: project.id,
            sender_id: data.user.id,
            body: `Audit message ${suffix}`,
          }),
          admin.storage
            .from("project-images")
            .upload(photoPath, new Blob(["audit"]), { upsert: true }),
          admin.storage
            .from("project-documents")
            .upload(docPath, new Blob(["audit"]), { upsert: true }),
        ]);
        storagePaths.push(
          { bucket: "project-images", path: photoPath },
          { bucket: "project-documents", path: docPath },
        );

        const token = await signIn(target, email, password);
        const tenant: Tenant = {
          label: suffix.toUpperCase(),
          userId: data.user.id,
          email,
          projectId: project.id,
          client: userClient(target, token),
          photoPath,
          docPath,
        };
        return tenant;
      }),
    );

    const [a, b] = seeds;

    // ---------- positive controls: each tenant sees their own data ----------
    for (const self of [a, b]) {
      await expectRows(
        `own-project-${self.label}`,
        "projects",
        `Tenant ${self.label} reads own project`,
        () => self.client.from("projects").select("id").eq("id", self.projectId),
      );
      await expectRows(
        `own-milestones-${self.label}`,
        "milestones",
        `Tenant ${self.label} reads own milestone activity`,
        () => self.client.from("project_activity").select("id").eq("project_id", self.projectId),
      );
      await expectRows(
        `own-photos-${self.label}`,
        "photos",
        `Tenant ${self.label} reads own site photos`,
        () => self.client.from("project_updates").select("id").eq("project_id", self.projectId),
      );
      await expectRows(
        `own-docs-${self.label}`,
        "documents",
        `Tenant ${self.label} reads own documents`,
        () => self.client.from("project_documents").select("id").eq("project_id", self.projectId),
      );
      await expectRows(
        `own-chat-${self.label}`,
        "chat",
        `Tenant ${self.label} reads own chat`,
        () => self.client.from("messages").select("id").eq("project_id", self.projectId),
      );

      // Positive storage controls: prove the private buckets are reachable for
      // the owner, so a cross-tenant "not found" is real scoping, not a blanket failure.
      for (const bc of [
        { bucket: "project-images", path: self.photoPath, what: "site photo" },
        { bucket: "project-documents", path: self.docPath, what: "document" },
      ]) {
        const res = await self.client.storage.from(bc.bucket).download(bc.path);
        push({
          id: `own-storage-${bc.bucket}-${self.label}`,
          group: "storage",
          label: `Tenant ${self.label} can download own ${bc.what}`,
          expected: "download allowed",
          actual: res.error ? `error: ${res.error.message}` : "downloaded",
          ok: !res.error,
        });
      }
    }

    // ---------- cross-tenant reads must be empty, in both directions ----------
    for (const [self, other] of [
      [a, b],
      [b, a],
    ] as const) {
      const tag = `${self.label}->${other.label}`;

      await expectEmpty(
        `x-project-${tag}`,
        "projects",
        `Tenant ${self.label} cannot read ${other.label}'s project row`,
        () =>
          self.client
            .from("projects")
            .select("id,name,address,milestones")
            .eq("id", other.projectId),
      );
      await expectEmpty(
        `x-project-list-${tag}`,
        "projects",
        `Tenant ${self.label} project list excludes ${other.label}`,
        async () => {
          const res = await self.client.from("projects").select("id");
          return {
            data: (res.data ?? []).filter((r) => r.id === other.projectId),
            error: res.error,
          };
        },
      );
      await expectEmpty(
        `x-milestones-${tag}`,
        "milestones",
        `Tenant ${self.label} cannot read ${other.label}'s milestone activity`,
        () =>
          self.client
            .from("project_activity")
            .select("id,milestone")
            .eq("project_id", other.projectId),
      );
      await expectEmpty(
        `x-milestones-any-${tag}`,
        "milestones",
        `Tenant ${self.label} unfiltered activity query leaks nothing`,
        async () => {
          const res = await self.client.from("project_activity").select("id,project_id");
          return {
            data: (res.data ?? []).filter((r) => r.project_id === other.projectId),
            error: res.error,
          };
        },
      );
      await expectEmpty(
        `x-photos-${tag}`,
        "photos",
        `Tenant ${self.label} cannot read ${other.label}'s photos`,
        () =>
          self.client
            .from("project_updates")
            .select("id,image_url")
            .eq("project_id", other.projectId),
      );
      await expectEmpty(
        `x-photos-any-${tag}`,
        "photos",
        `Tenant ${self.label} unfiltered photo query leaks nothing`,
        async () => {
          const res = await self.client.from("project_updates").select("id,project_id");
          return {
            data: (res.data ?? []).filter((r) => r.project_id === other.projectId),
            error: res.error,
          };
        },
      );
      await expectEmpty(
        `x-docs-${tag}`,
        "documents",
        `Tenant ${self.label} cannot read ${other.label}'s documents`,
        () =>
          self.client
            .from("project_documents")
            .select("id,file_path")
            .eq("project_id", other.projectId),
      );
      await expectEmpty(
        `x-docs-any-${tag}`,
        "documents",
        `Tenant ${self.label} unfiltered document query leaks nothing`,
        async () => {
          const res = await self.client.from("project_documents").select("id,project_id");
          return {
            data: (res.data ?? []).filter((r) => r.project_id === other.projectId),
            error: res.error,
          };
        },
      );
      await expectEmpty(
        `x-chat-${tag}`,
        "chat",
        `Tenant ${self.label} cannot read ${other.label}'s chat`,
        () => self.client.from("messages").select("id,body").eq("project_id", other.projectId),
      );
      await expectEmpty(
        `x-chat-any-${tag}`,
        "chat",
        `Tenant ${self.label} unfiltered chat query leaks nothing`,
        async () => {
          const res = await self.client.from("messages").select("id,project_id");
          return {
            data: (res.data ?? []).filter((r) => r.project_id === other.projectId),
            error: res.error,
          };
        },
      );
      await expectEmpty(
        `x-profile-${tag}`,
        "projects",
        `Tenant ${self.label} cannot read ${other.label}'s profile`,
        () => self.client.from("profiles").select("id,email").eq("id", other.userId),
      );

      // ---------- cross-tenant writes must be rejected ----------
      await expectEmpty(
        `x-chat-send-${tag}`,
        "chat",
        `Tenant ${self.label} cannot post into ${other.label}'s chat`,
        () =>
          self.client
            .from("messages")
            .insert({
              project_id: other.projectId,
              sender_id: self.userId,
              body: "should never land",
            })
            .select("id"),
      );
      await expectEmpty(
        `x-milestone-write-${tag}`,
        "milestones",
        `Tenant ${self.label} cannot change ${other.label}'s milestones`,
        () =>
          self.client
            .from("projects")
            .update({ current_milestone: 6 })
            .eq("id", other.projectId)
            .select("id"),
      );
      await expectEmpty(
        `x-milestone-own-write-${tag}`,
        "milestones",
        `Tenant ${self.label} cannot change own milestones (staff only)`,
        () =>
          self.client
            .from("projects")
            .update({ current_milestone: 6 })
            .eq("id", self.projectId)
            .select("id"),
      );
      await expectEmpty(
        `x-activity-write-${tag}`,
        "milestones",
        `Tenant ${self.label} cannot log activity on ${other.label}'s project`,
        () =>
          self.client
            .from("project_activity")
            .insert({
              project_id: other.projectId,
              milestone: "Handover",
              action: "status_change",
              to_status: "complete",
            })
            .select("id"),
      );
      await expectEmpty(
        `x-photo-write-${tag}`,
        "photos",
        `Tenant ${self.label} cannot add photos to ${other.label}'s project`,
        () =>
          self.client
            .from("project_updates")
            .insert({ project_id: other.projectId, image_url: "https://example.invalid/x.jpg" })
            .select("id"),
      );
      await expectEmpty(
        `x-doc-write-${tag}`,
        "documents",
        `Tenant ${self.label} cannot add documents to ${other.label}'s project`,
        () =>
          self.client
            .from("project_documents")
            .insert({
              project_id: other.projectId,
              name: "x",
              file_path: `${other.projectId}/x.pdf`,
            })
            .select("id"),
      );
      await expectEmpty(
        `x-doc-delete-${tag}`,
        "documents",
        `Tenant ${self.label} cannot delete ${other.label}'s documents`,
        () =>
          self.client
            .from("project_documents")
            .delete()
            .eq("project_id", other.projectId)
            .select("id"),
      );
      await expectEmpty(
        `x-role-write-${tag}`,
        "projects",
        `Tenant ${self.label} cannot self-grant a staff role`,
        () =>
          (
            self.client.from("user_roles") as unknown as {
              insert: (v: unknown) => {
                select: (
                  c: string,
                ) => PromiseLike<{ data: unknown[] | null; error: { message: string } | null }>;
              };
            }
          )
            .insert({ user_id: self.userId, role: "superadmin" })
            .select("id"),
      );

      // ---------- private storage objects ----------
      const bucketChecks: {
        id: string;
        group: RlsCheck["group"];
        label: string;
        bucket: string;
        path: string;
      }[] = [
        {
          id: `x-storage-photo-${tag}`,
          group: "storage",
          label: `Tenant ${self.label} cannot download ${other.label}'s site photo`,
          bucket: "project-images",
          path: other.photoPath,
        },
        {
          id: `x-storage-doc-${tag}`,
          group: "storage",
          label: `Tenant ${self.label} cannot download ${other.label}'s document`,
          bucket: "project-documents",
          path: other.docPath,
        },
      ];
      for (const bc of bucketChecks) {
        const res = await self.client.storage.from(bc.bucket).download(bc.path);
        push({
          id: bc.id,
          group: bc.group,
          label: bc.label,
          expected: "download denied",
          actual: res.error
            ? `blocked: ${res.error.message}`
            : `downloaded ${(await res.data!.text()).length} bytes`,
          ok: Boolean(res.error),
        });
      }
      const signed = await self.client.storage
        .from("project-documents")
        .createSignedUrl(other.docPath, 60);
      push({
        id: `x-storage-signed-${tag}`,
        group: "storage",
        label: `Tenant ${self.label} cannot sign a URL for ${other.label}'s document`,
        expected: "signing denied",
        actual: signed.error ? `blocked: ${signed.error.message}` : "signed URL issued",
        ok: Boolean(signed.error),
      });
    }
  } catch (e) {
    error = (e as Error).message;
  }

  // ---------- cleanup ----------
  try {
    for (const { bucket, path } of storagePaths) {
      await admin.storage.from(bucket).remove([path]);
    }
    for (const projectId of createdProjects) {
      await admin.from("messages").delete().eq("project_id", projectId);
      await admin.from("project_activity").delete().eq("project_id", projectId);
      await admin.from("project_updates").delete().eq("project_id", projectId);
      await admin.from("project_documents").delete().eq("project_id", projectId);
      await admin.from("projects").delete().eq("id", projectId);
    }
    for (const userId of createdUsers) {
      await admin.from("user_roles").delete().eq("user_id", userId);
      await admin.from("profiles").delete().eq("id", userId);
      await admin.auth.admin.deleteUser(userId);
    }
  } catch (e) {
    cleanupOk = false;
    error = error ?? `Cleanup issue: ${(e as Error).message}`;
  }

  return {
    ranAt: new Date().toISOString(),
    durationMs: Date.now() - started,
    passed: checks.filter((c) => c.ok).length,
    failed: checks.filter((c) => !c.ok).length,
    checks,
    cleanupOk,
    error,
  };
}
