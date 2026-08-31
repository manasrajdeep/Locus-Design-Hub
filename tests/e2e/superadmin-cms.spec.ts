import { test, expect, type Page } from "@playwright/test";
import {
  adminClient,
  anonClient,
  hasPublicApi,
  hasServiceRole,
  seedTargetReason,
} from "./supabase-helpers";

/**
 * Drives the real Superadmin CMS UI (/superadmin -> /admin/homepage): signs a
 * throwaway superadmin in with email/password, edits hero, services and
 * portfolio, saves, and then verifies the public homepage renders the new
 * revision. Runs twice so a second revision on top of the first is covered.
 */

type Stat = { label: string; value: string };
type Service = { title: string; description: string; icon?: string };
type Portfolio = { image_url: string; caption?: string };
type Content = {
  id: string;
  hero_title: string;
  hero_subtitle: string;
  hero_image_url: string;
  stats: Stat[];
  services: Service[];
  portfolio: Portfolio[];
};

const SELECT = "id, hero_title, hero_subtitle, hero_image_url, stats, services, portfolio";

async function readContent(): Promise<Content> {
  const { data, error } = await anonClient()
    .from("homepage_content")
    .select(SELECT)
    .limit(1)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) throw new Error("homepage_content is empty");
  return data as unknown as Content;
}

async function seedSuperadmin() {
  const admin = adminClient();
  const stamp = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const email = `pw-superadmin-${stamp}@example.com`;
  const password = `Pw!${stamp}Aa1`;
  const { data, error } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { full_name: "PW Superadmin" },
  });
  if (error || !data.user) throw new Error(`createUser failed: ${error?.message}`);
  const userId = data.user.id;
  const { error: roleErr } = await admin
    .from("user_roles")
    .insert({ user_id: userId, role: "superadmin" });
  if (roleErr) throw new Error(`role grant failed: ${roleErr.message}`);
  return { email, password, userId };
}

async function cleanupSuperadmin(userId: string) {
  const admin = adminClient();
  await admin.from("user_roles").delete().eq("user_id", userId);
  await admin.auth.admin.deleteUser(userId);
}

async function signInAsSuperadmin(page: Page, email: string, password: string) {
  await page.goto("/admin", { waitUntil: "domcontentloaded" });
  await page.getByRole("heading", { name: "Sign in." }).waitFor();
  await page.locator('input[type="email"]').fill(email);
  await page.locator('input[type="password"]').fill(password);
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await page.waitForURL(/\/superadmin\/home/, { timeout: 20_000 });
  // Editor is ready once the hero title input is populated.
  await expect(cmsField(page, "Hero title")).not.toHaveValue("", { timeout: 20_000 });
}

/** Input/textarea rendered under a CMS <Field label="..."> block. */
function cmsField(page: Page, label: string) {
  return page.locator(
    `xpath=//label[normalize-space(text())="${label}"]/following-sibling::div[1]//*[self::input or self::textarea]`,
  );
}

function serviceCard(page: Page, index: number) {
  return page
    .locator("section", { has: page.getByRole("heading", { name: "Services" }) })
    .locator("div.rounded-md.border")
    .nth(index);
}

async function saveCms(page: Page) {
  const save = page.getByRole("button", { name: "Save changes" }).first();
  await expect(save).toBeEnabled();
  await save.click();
  await expect(save).toBeDisabled({ timeout: 20_000 });
}

async function expectHomepage(
  page: Page,
  rev: { heroTitle: string; heroSubtitle: string; serviceTitle: string; captions: string[] },
) {
  await page.goto("/", { waitUntil: "domcontentloaded" });
  const h1 = page.locator("h1");
  await expect(h1).toHaveCount(1);
  await expect(h1).toHaveText(rev.heroTitle);
  await expect(page.getByText(rev.heroSubtitle, { exact: false }).first()).toBeVisible();
  await expect(
    page.locator("#services").getByText(rev.serviceTitle, { exact: false }).first(),
  ).toBeVisible();
  await expect(page.locator("#portfolio figure")).toHaveCount(rev.captions.length);
  await expect(
    page.locator("#portfolio").getByText(`${rev.captions.length} documented builds`),
  ).toBeVisible();
  for (const caption of rev.captions) {
    await expect(
      page.locator("#portfolio").getByText(caption, { exact: false }).first(),
    ).toBeAttached();
  }
}

test.describe("superadmin edits the public homepage", () => {
  test.skip(!hasPublicApi, "Supabase public API env not available");
  test.skip(!hasServiceRole, `cannot provision a superadmin: ${seedTargetReason}`);

  let original: Content;
  let account: { email: string; password: string; userId: string };

  test.beforeAll(async () => {
    original = await readContent();
    account = await seedSuperadmin();
  });

  test.afterAll(async () => {
    const admin = adminClient();
    await admin
      .from("homepage_content")
      .update({
        hero_title: original.hero_title,
        hero_subtitle: original.hero_subtitle,
        hero_image_url: original.hero_image_url,
        stats: original.stats,
        services: original.services,
        portfolio: original.portfolio,
      })
      .eq("id", original.id);
    if (account) await cleanupSuperadmin(account.userId);
  });

  test("two successive CMS revisions render on the public homepage", async ({ page }) => {
    test.setTimeout(180_000);
    await signInAsSuperadmin(page, account.email, account.password);

    const stamp = Date.now();

    // ---- Revision 1: rewrite hero + first service, trim portfolio to two tiles.
    const rev1 = {
      heroTitle: `Superadmin Revision One ${stamp}`,
      heroSubtitle: "Edited through the Superadmin CMS in revision one.",
      serviceTitle: `Structural Engineering R1 ${stamp}`,
      captions: [`R1 Tile Alpha ${stamp}`, `R1 Tile Bravo ${stamp}`],
    };

    await cmsField(page, "Hero title").fill(rev1.heroTitle);
    await cmsField(page, "Hero subtitle").fill(rev1.heroSubtitle);

    await serviceCard(page, 0).getByPlaceholder("Title").fill(rev1.serviceTitle);
    await serviceCard(page, 0)
      .getByPlaceholder("Description")
      .fill("Rafts, frames and retaining systems.");

    // Reduce the portfolio to exactly two tiles, then caption them.
    const removeTile = page
      .locator("section", { has: page.getByRole("heading", { name: "Portfolio" }) })
      .locator("div.grid button");
    while ((await removeTile.count()) > 2) {
      await removeTile.last().click();
    }
    const tiles = page
      .locator("section", { has: page.getByRole("heading", { name: "Portfolio" }) })
      .locator("div.grid");
    for (let i = 0; i < 2; i++) {
      const url = original.portfolio[i]?.image_url ?? original.hero_image_url;
      await tiles.nth(i).getByPlaceholder("Image URL").fill(url);
      await tiles.nth(i).getByPlaceholder("Caption (optional)").fill(rev1.captions[i]!);
    }

    // The live preview must mirror the pending edit before saving.
    await expect(page.getByText(rev1.heroTitle, { exact: false }).first()).toBeVisible();

    await saveCms(page);
    await expectHomepage(page, rev1);

    // ---- Revision 2: edit on top of revision 1 — new hero, new service, one added tile.
    await page.goto("/admin/homepage", { waitUntil: "domcontentloaded" });
    await expect(cmsField(page, "Hero title")).toHaveValue(rev1.heroTitle, { timeout: 20_000 });

    const rev2 = {
      heroTitle: `Superadmin Revision Two ${stamp}`,
      heroSubtitle: "Second revision layered on top of the first.",
      serviceTitle: `Turnkey Delivery R2 ${stamp}`,
      captions: [...rev1.captions, `R2 Tile Charlie ${stamp}`],
    };

    await cmsField(page, "Hero title").fill(rev2.heroTitle);
    await cmsField(page, "Hero subtitle").fill(rev2.heroSubtitle);
    await serviceCard(page, 0).getByPlaceholder("Title").fill(rev2.serviceTitle);

    await page.getByRole("button", { name: "Add portfolio item" }).click();
    const tiles2 = page
      .locator("section", { has: page.getByRole("heading", { name: "Portfolio" }) })
      .locator("div.grid");
    await tiles2.nth(2).getByPlaceholder("Image URL").fill(original.hero_image_url);
    await tiles2.nth(2).getByPlaceholder("Caption (optional)").fill(rev2.captions[2]!);

    await saveCms(page);
    await expectHomepage(page, rev2);
  });
});
