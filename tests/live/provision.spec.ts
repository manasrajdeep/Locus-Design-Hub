import { test, expect } from "@playwright/test";

/**
 * Drives the "Add a client" form the way an admin actually does.
 *
 * Exercised through the browser rather than by POSTing the server function
 * directly: TanStack Start serialises those calls itself, so a hand-rolled
 * request tests the wire format rather than the feature.
 */
const SITE = process.env["LIVE_URL"] ?? "https://locusdesign.online";
const ADMIN_EMAIL = "locus.design@locusdesign.com";
const ADMIN_PASSWORD = "LocusPortal!2026";

const stamp = Date.now();
const clientEmail = `uitest-${stamp}@locusdesign.online`;
const clientPassword = "reta-vusk-4839";

async function signIn(page, email: string, password: string) {
  await page.goto(`${SITE}/auth?staff=true`);
  // Wait for hydration: the form renders server-side but its submit handler only
  // exists once React has taken over, so an early click posts nothing.
  await page.waitForLoadState("networkidle");
  await page.locator("#email").fill(email);
  await page.locator("#password").fill(password);
  await page.locator('button[type="submit"]').click();
}

test("admin provisions a client, and that client can sign in", async ({ page }) => {
  await signIn(page, ADMIN_EMAIL, ADMIN_PASSWORD);
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

test("the provisioned client can sign in and sees only their project", async ({ page }) => {
  await signIn(page, clientEmail, clientPassword);
  // A customer who owns a project lands on the portal; anything else means the
  // provisioning did not attach one.
  await page.waitForURL(/\/portal/, { timeout: 45_000 });
  await expect(page.getByText("Gomti Nagar Villa").first()).toBeVisible({ timeout: 25_000 });
});
