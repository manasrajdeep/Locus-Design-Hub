import { test, expect } from "@playwright/test";

/**
 * Drives the "Add a client" form the way an admin actually does.
 *
 * Exercised through the browser rather than by POSTing the server function
 * directly: TanStack Start serialises those calls itself, so a hand-rolled
 * request tests the wire format rather than the feature.
 */
const SITE = process.env["LIVE_URL"] ?? "https://locusdesign.online";

/**
 * Staff credentials come from the environment, never the repository.
 *
 * These sign in to production with an account that can create other accounts,
 * so a literal here would put a working admin password in the git history —
 * where rotating it later does not remove it. Set them in .env, which is
 * gitignored:
 *
 *   LIVE_ADMIN_EMAIL=...
 *   LIVE_ADMIN_PASSWORD=...
 */
const ADMIN_EMAIL = process.env["LIVE_ADMIN_EMAIL"];
const ADMIN_PASSWORD = process.env["LIVE_ADMIN_PASSWORD"];

test.skip(
  !ADMIN_EMAIL || !ADMIN_PASSWORD,
  "Set LIVE_ADMIN_EMAIL and LIVE_ADMIN_PASSWORD to run the live provisioning tests.",
);

const stamp = Date.now();
const clientEmail = `uitest-${stamp}@locusdesign.online`;
const clientPassword = "reta-vusk-4839";
const ANON_KEY = "sb_publishable_Q9q3PMtnnL9_4RaplFcrXg_MLUZc04-";

async function signIn(page, email: string, password: string) {
  await page.goto(`${SITE}/auth`);
  // Wait for hydration: the form renders server-side but its submit handler only
  // exists once React has taken over, so an early click posts nothing.
  await page.waitForLoadState("networkidle");
  await page.locator("#email").fill(email);
  await page.locator("#password").fill(password);
  await page.locator('button[type="submit"]').click();
}

test("admin provisions a client, and that client can sign in", async ({ page }) => {
  await signIn(page, ADMIN_EMAIL!, ADMIN_PASSWORD!);
  await page.waitForURL(/\/admin/, { timeout: 30_000 });

  await expect(page.getByText("Add a client")).toBeVisible();
  await page.getByLabel("Client email").fill(clientEmail);
  await page.getByLabel("Client full name").fill("Ramesh Kumar");
  await page.getByLabel("Project name").fill("Gomti Nagar Villa");
  await page.getByLabel("Client password").fill(clientPassword);
  await page.getByRole("button", { name: "Create client account" }).click();

  // The one-time credentials panel is the success signal.
  await expect(page.getByText("Account ready")).toBeVisible({ timeout: 30_000 });
  await expect(page.getByText(clientEmail)).toBeVisible();

  // The project joins the client picker. That is a <select>, so assert on the
  // option's presence rather than its visibility — Playwright counts options
  // inside a closed select as hidden.
  await expect(page.locator("option", { hasText: "Gomti Nagar Villa" }).first()).toHaveCount(1, {
    timeout: 20_000,
  });
});

test("the plain /auth page offers a password field, not just a link", async ({ page }) => {
  await page.goto(`${SITE}/auth`);
  await page.waitForLoadState("networkidle");
  // The regression this guards: clients were shown only the magic-link form, so
  // the credentials an admin had just handed them could not be entered at all.
  await expect(page.locator("#password")).toBeVisible();
  await expect(page.locator("#email")).toBeVisible();
});

test("the provisioned client can sign in and sees only their project", async ({ page }) => {
  await signIn(page, clientEmail, clientPassword);
  // A customer who owns a project lands on the portal; anything else means the
  // provisioning did not attach one.
  await page.waitForURL(/\/portal/, { timeout: 45_000 });
  await expect(page.getByText("Gomti Nagar Villa").first()).toBeVisible({ timeout: 25_000 });
});

test("admin can reset a client's password, and the new one works", async ({ page }) => {
  await signIn(page, ADMIN_EMAIL!, ADMIN_PASSWORD!);
  await page.waitForURL(/\/admin/, { timeout: 30_000 });

  // Pick the client provisioned by the first test.
  await page.locator("select").selectOption({ label: `Ramesh Kumar · Gomti Nagar Villa` });
  await page.getByRole("button", { name: "Reset password" }).click();

  await expect(page.getByText("New password — shown once")).toBeVisible({ timeout: 30_000 });
  const shown = await page.locator("p.font-mono").first().innerText();
  expect(shown.length).toBeGreaterThan(9);

  // The old password must now be dead, and the new one must work.
  const ctx = page.context();
  const oldTry = await ctx.request.post(
    "https://abkuxwnkelygkajcypfw.supabase.co/auth/v1/token?grant_type=password",
    {
      headers: { apikey: ANON_KEY, "Content-Type": "application/json" },
      data: { email: clientEmail, password: clientPassword },
    },
  );
  expect(oldTry.status()).toBeGreaterThanOrEqual(400);

  const newTry = await ctx.request.post(
    "https://abkuxwnkelygkajcypfw.supabase.co/auth/v1/token?grant_type=password",
    {
      headers: { apikey: ANON_KEY, "Content-Type": "application/json" },
      data: { email: clientEmail, password: shown.trim() },
    },
  );
  expect(newTry.ok()).toBeTruthy();
});
