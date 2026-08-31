import { test, expect } from "@playwright/test";

/**
 * First-visit auto-detection: a Hindi browser should render the whole UI in
 * Hindi without any manual toggle, while a saved preference always wins.
 */

const DEVANAGARI = /[\u0900-\u097F]/;

/** The toggle can be clicked before React hydrates it; retry until lang flips. */
async function clickUntil(
  page: import("@playwright/test").Page,
  title: string,
  target: "en" | "hi",
) {
  for (let attempt = 0; attempt < 6; attempt++) {
    if ((await page.getAttribute("html", "lang")) === target) break;
    await page
      .getByTitle(title)
      .first()
      .click({ force: true })
      .catch(() => {});
    await page.waitForTimeout(600);
  }
  await expect(page.locator("html")).toHaveAttribute("lang", target);
}

test.describe("i18n browser auto-detect", () => {
  test.use({ locale: "hi-IN" });

  test("Hindi browser loads the site in Hindi on first visit", async ({ browser }) => {
    const context = await browser.newContext({
      locale: "hi-IN",
      // navigator.languages is what the provider inspects.
      extraHTTPHeaders: { "Accept-Language": "hi-IN,hi;q=0.9,en;q=0.5" },
    });
    const page = await context.newPage();
    await page.addInitScript(() => {
      Object.defineProperty(navigator, "languages", { get: () => ["hi-IN", "hi", "en"] });
      Object.defineProperty(navigator, "language", { get: () => "hi-IN" });
    });

    await page.goto("/");
    await expect(page.locator("html")).toHaveAttribute("lang", "hi", { timeout: 15_000 });

    await expect(page.locator("footer")).toBeVisible();
    const body = ((await page.locator("body").textContent()) ?? "").replace(/\s+/g, " ");
    expect(body).toMatch(DEVANAGARI);
    for (const leftover of ["Services", "Portfolio", "Get in touch"]) {
      expect(body).not.toContain(leftover);
    }
    // Footer credit is a brand string and must stay verbatim.
    expect(body).toContain("manasrajdeep.in");

    await context.close();
  });

  test("a saved English preference beats the Hindi browser setting", async ({ browser }) => {
    const context = await browser.newContext({ locale: "hi-IN" });
    const page = await context.newPage();
    await page.addInitScript(() => {
      Object.defineProperty(navigator, "languages", { get: () => ["hi-IN", "hi"] });
      localStorage.setItem("lang", "en");
    });

    await page.goto("/");
    await expect(page.locator("html")).toHaveAttribute("lang", "en", { timeout: 15_000 });
    const body = ((await page.locator("body").textContent()) ?? "").replace(/\s+/g, " ");
    expect(body).toContain("Services");

    await context.close();
  });

  test("toggling shows a confirmation toast in the new language", async ({ page }) => {
    await page.addInitScript(() => localStorage.setItem("lang", "en"));
    await page.goto("/");
    await expect(page.locator("html")).toHaveAttribute("lang", "en");

    await clickUntil(page, "Switch to Hindi", "hi");
    await expect(page.getByText("भाषा हिंदी में बदल दी गई").first()).toBeVisible({
      timeout: 10_000,
    });

    await clickUntil(page, "Switch to English", "en");
    await expect(page.getByText("Language switched to English").first()).toBeVisible({
      timeout: 10_000,
    });
  });
});
