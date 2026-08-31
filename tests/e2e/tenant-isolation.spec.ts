import { test, expect, type Page } from "@playwright/test";
import {
  SUPABASE_PUBLISHABLE_KEY,
  SUPABASE_URL,
  cleanupTenant,
  hasServiceRole,
  restAs,
  seedTargetReason,
  seedTenant,
  type SeededTenant,
} from "./supabase-helpers";

/**
 * Multi-tenant isolation coverage. Two throwaway customers are provisioned with
 * their own project, milestone activity, site photo, document and chat message.
 * Every cross-tenant read/write is attempted both through the Data API and from
 * inside a real browser session, and must come back empty or denied.
 */
test.describe("multi-tenant isolation", () => {
  test.skip(!hasServiceRole, `cannot seed tenants: ${seedTargetReason}`);
  test.describe.configure({ mode: "serial" });

  let a: SeededTenant;
  let b: SeededTenant;

  test.beforeAll(async () => {
    a = await seedTenant("a");
    b = await seedTenant("b");
  });

  test.afterAll(async () => {
    if (a) await cleanupTenant(a);
    if (b) await cleanupTenant(b);
  });

  const tables = [
    { table: "projects", filterCol: "id" },
    { table: "project_activity", filterCol: "project_id" },
    { table: "project_updates", filterCol: "project_id" },
    { table: "project_documents", filterCol: "project_id" },
    { table: "messages", filterCol: "project_id" },
  ] as const;

  test("each tenant reads only its own rows", async () => {
    for (const [self, other] of [
      [a, b],
      [b, a],
    ] as const) {
      for (const { table, filterCol } of tables) {
        const own = await restAs(self.token, `${table}?${filterCol}=eq.${self.projectId}&select=*`);
        expect(own.status, `${self.label} own ${table}`).toBe(200);
        expect(
          Array.isArray(own.body) && own.body.length,
          `${self.label} own ${table} rows`,
        ).toBeGreaterThan(0);

        const cross = await restAs(
          self.token,
          `${table}?${filterCol}=eq.${other.projectId}&select=*`,
        );
        const rows = Array.isArray(cross.body) ? cross.body : [];
        expect(cross.status < 500, `${self.label} cross ${table} status ${cross.status}`).toBe(
          true,
        );
        expect(rows.length, `${self.label} leaked ${table} rows of ${other.label}`).toBe(0);
        expect(JSON.stringify(cross.body ?? "")).not.toContain(other.secret);
      }
    }
  });

  test("cross-tenant writes are rejected", async () => {
    const attempts: { label: string; run: () => Promise<{ status: number; body: unknown }> }[] = [
      {
        label: "insert chat message into other project",
        run: () =>
          restAs(a.token, "messages", {
            method: "POST",
            body: JSON.stringify({
              project_id: b.projectId,
              sender_id: a.userId,
              body: "intruder",
            }),
          }),
      },
      {
        label: "insert site photo into other project",
        run: () =>
          restAs(a.token, "project_updates", {
            method: "POST",
            body: JSON.stringify({
              project_id: b.projectId,
              image_url: "x.jpg",
              caption: "intruder",
            }),
          }),
      },
      {
        label: "insert document into other project",
        run: () =>
          restAs(a.token, "project_documents", {
            method: "POST",
            body: JSON.stringify({
              project_id: b.projectId,
              name: "x.pdf",
              file_path: "x.pdf",
              kind: "other",
            }),
          }),
      },
      {
        label: "insert activity into other project",
        run: () =>
          restAs(a.token, "project_activity", {
            method: "POST",
            body: JSON.stringify({
              project_id: b.projectId,
              milestone: "intruder",
              action: "status_change",
            }),
          }),
      },
      {
        label: "rename other project",
        run: () =>
          restAs(a.token, `projects?id=eq.${b.projectId}`, {
            method: "PATCH",
            body: JSON.stringify({ name: "hijacked" }),
          }),
      },
      {
        label: "delete other project",
        run: () => restAs(a.token, `projects?id=eq.${b.projectId}`, { method: "DELETE" }),
      },
    ];

    for (const attempt of attempts) {
      const res = await attempt.run();
      const rows = Array.isArray(res.body) ? res.body : [];
      const denied = res.status >= 400 || rows.length === 0;
      expect(denied, `${attempt.label} was NOT denied (status ${res.status})`).toBe(true);
    }

    // Tenant B's data must be untouched afterwards.
    const own = await restAs(b.token, `projects?id=eq.${b.projectId}&select=name`);
    expect(JSON.stringify(own.body)).toContain(b.secret);
  });

  test("private storage buckets block cross-tenant downloads", async () => {
    for (const [self, other] of [
      [a, b],
      [b, a],
    ] as const) {
      for (const [bucket, ownPath, otherPath] of [
        ["project-images", self.photoPath, other.photoPath],
        ["project-documents", self.docPath, other.docPath],
      ] as const) {
        const ownRes = await fetch(`${SUPABASE_URL}/storage/v1/object/${bucket}/${ownPath}`, {
          headers: { apikey: SUPABASE_PUBLISHABLE_KEY, Authorization: `Bearer ${self.token}` },
        });
        expect(ownRes.ok, `${self.label} cannot read own ${bucket} object`).toBe(true);

        const crossRes = await fetch(`${SUPABASE_URL}/storage/v1/object/${bucket}/${otherPath}`, {
          headers: { apikey: SUPABASE_PUBLISHABLE_KEY, Authorization: `Bearer ${self.token}` },
        });
        expect(crossRes.ok, `${self.label} downloaded ${other.label}'s ${bucket} object`).toBe(
          false,
        );

        const signRes = await fetch(
          `${SUPABASE_URL}/storage/v1/object/sign/${bucket}/${otherPath}`,
          {
            method: "POST",
            headers: {
              apikey: SUPABASE_PUBLISHABLE_KEY,
              Authorization: `Bearer ${self.token}`,
              "Content-Type": "application/json",
            },
            body: JSON.stringify({ expiresIn: 60 }),
          },
        );
        expect(signRes.ok, `${self.label} signed a URL for ${other.label}'s object`).toBe(false);
      }
    }
  });

  test("a signed-in browser session cannot surface the other tenant's data", async ({ page }) => {
    await installSession(page, a);
    await page.goto("/portal", { waitUntil: "domcontentloaded" });
    await page.waitForTimeout(2500);

    const html = await page.content();
    expect(html, "tenant B data leaked into tenant A's portal HTML").not.toContain(b.secret);

    // Same queries the client code would run, executed with tenant A's live session.
    const result = await page.evaluate(
      async ({ url, key, token, projectId }) => {
        const out: Record<string, number> = {};
        for (const [table, col] of [
          ["projects", "id"],
          ["project_activity", "project_id"],
          ["project_updates", "project_id"],
          ["project_documents", "project_id"],
          ["messages", "project_id"],
        ] as const) {
          const res = await fetch(`${url}/rest/v1/${table}?${col}=eq.${projectId}&select=*`, {
            headers: { apikey: key, Authorization: `Bearer ${token}` },
          });
          const body = await res.json().catch(() => null);
          out[table] = Array.isArray(body) ? body.length : -res.status;
        }
        return out;
      },
      {
        url: SUPABASE_URL,
        key: SUPABASE_PUBLISHABLE_KEY,
        token: a.token,
        projectId: b.projectId,
      },
    );

    for (const [table, count] of Object.entries(result)) {
      expect(count <= 0, `browser session read ${count} of tenant B's ${table} rows`).toBe(true);
    }
  });
});

/** Seeds a Supabase session into localStorage so the app treats the tenant as signed in. */
async function installSession(page: Page, tenant: SeededTenant) {
  await page.goto("/", { waitUntil: "domcontentloaded" });
  const projectRef = new URL(SUPABASE_URL).host.split(".")[0];
  await page.evaluate(
    ({ storageKey, token, userId, email }) => {
      window.localStorage.setItem(
        storageKey,
        JSON.stringify({
          access_token: token,
          token_type: "bearer",
          expires_in: 3600,
          expires_at: Math.floor(Date.now() / 1000) + 3600,
          refresh_token: "test-refresh",
          user: { id: userId, email, aud: "authenticated", role: "authenticated" },
        }),
      );
    },
    {
      storageKey: `sb-${projectRef}-auth-token`,
      token: tenant.token,
      userId: tenant.userId,
      email: tenant.email,
    },
  );
}
