import { test, expect, type Page } from "@playwright/test";

/**
 * Exercises the homepage CMS against the live site.
 *
 * The draft/publish split is what matters here: an edit must not reach visitors
 * until someone presses Publish. Proving that means publishing to the real
 * homepage, so an afterAll hook restores the original copy unconditionally —
 * an earlier version restored inline, and when an assertion failed midway the
 * live site kept serving the probe text until someone noticed.
 */
const ADMIN_EMAIL = process.env["LIVE_ADMIN_EMAIL"];
const ADMIN_PASSWORD = process.env["LIVE_ADMIN_PASSWORD"];
const ORIGINAL = "Building Landmarks, Delivering Trust";
const PROBE = "CMS PROBE — do not ship";

test.describe.configure({ mode: "serial" });
test.skip(!ADMIN_EMAIL || !ADMIN_PASSWORD, "Set LIVE_ADMIN_EMAIL / LIVE_ADMIN_PASSWORD.");

async function signInAdmin(page: Page) {
  await page.goto("/auth");
  await page.waitForLoadState("networkidle");
  await page.locator("#email").fill(ADMIN_EMAIL!);
  await page.locator("#password").fill(ADMIN_PASSWORD!);
  await page.locator('button[type="submit"]').click();
  await page.waitForURL(/\/admin/, { timeout: 30_000 });
}

const heroInput = (page: Page) =>
  page.locator('div:has(> label:text-is("Hero title")) input').first();

async function liveHeroTitle(page: Page): Promise<string> {
  const res = await page.context().request.get(`/?cachebust=${Date.now()}`);
  const m = /<h1[^>]*>(.*?)<\/h1>/s.exec(await res.text());
  return m ? m[1]!.replace(/<[^>]+>/g, "").trim() : "";
}

/** Sets the hero title and publishes, waiting for the editor to settle first. */
async function setAndPublish(page: Page, value: string) {
  await page.goto("/admin/homepage");
  await expect(heroInput(page)).toBeVisible({ timeout: 30_000 });
  await heroInput(page).fill(value);
  // The autosave debounce is 1s; give it room to persist before publishing.
  await expect(page.getByTestId("publish")).toBeEnabled({ timeout: 20_000 });
  await page.waitForTimeout(2000);
  await page.getByTestId("publish").click();
  await expect.poll(() => liveHeroTitle(page), { timeout: 60_000 }).toBe(value);
}

test.afterAll(async ({ browser }) => {
  // Unconditional: whatever happened above, the homepage goes back.
  const page = await (await browser.newContext()).newPage();
  try {
    if ((await liveHeroTitle(page)) === ORIGINAL) return;
    await signInAdmin(page);
    await setAndPublish(page, ORIGINAL);
  } finally {
    await page.close();
  }
});

test("CMS loads for a superadmin with the current content", async ({ page }) => {
  await signInAdmin(page);
  await page.goto("/admin/homepage");
  await expect(page.getByRole("heading", { name: "Public homepage" })).toBeVisible();
  await expect(heroInput(page)).toHaveValue(ORIGINAL);
});

test("an edit stays a draft until it is published", async ({ page }) => {
  await signInAdmin(page);
  await page.goto("/admin/homepage");
  await expect(heroInput(page)).toHaveValue(ORIGINAL);

  await heroInput(page).fill(PROBE);
  await expect(page.getByTestId("publish")).toBeEnabled({ timeout: 20_000 });

  // The point of the whole feature: visitors still see the published copy.
  expect(await liveHeroTitle(page)).toBe(ORIGINAL);

  await page.waitForTimeout(2000);
  await page.getByTestId("publish").click();
  await expect.poll(() => liveHeroTitle(page), { timeout: 60_000 }).toBe(PROBE);
});

test("the published change can be reverted through the CMS", async ({ page }) => {
  await signInAdmin(page);
  await setAndPublish(page, ORIGINAL);
  expect(await liveHeroTitle(page)).toBe(ORIGINAL);
});

test("the CMS is not reachable without signing in", async ({ page }) => {
  await page.goto("/admin/homepage");
  await expect(page.getByRole("heading", { name: "Public homepage" })).toHaveCount(0);
});
