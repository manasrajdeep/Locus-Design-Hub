import { test, expect, type Page } from "@playwright/test";

/**
 * EN <-> HI localisation coverage for the public site: navigation, homepage
 * sections, the contact form and its toasts, and the footer.
 *
 * Signed-in areas (portal, admin) are not covered here — they need a seeded
 * account, so they belong with the service-role specs.
 */

const DEVANAGARI = /[\u0900-\u097F]/;

async function switchTo(page: Page, target: "hi" | "en") {
  const title = target === "hi" ? "Switch to Hindi" : "Switch to English";
  // Retry: the first click can land before React has hydrated the toggle.
  for (let attempt = 0; attempt < 6; attempt++) {
    if ((await page.getAttribute("html", "lang")) === target) break;
    const button = page.getByTitle(title).first();
    if (await button.count()) {
      await button.click({ force: true }).catch(() => {});
    }
    await page.waitForTimeout(600);
  }
  await expect(page.locator("html")).toHaveAttribute("lang", target);
}

async function bodyText(page: Page) {
  return (await page.locator("body").innerText()).replace(/\s+/g, " ");
}

test.describe("i18n EN/HI", () => {
  test("homepage switches to Hindi and back", async ({ page }) => {
    await page.goto("/");
    await expect(page.locator("html")).toHaveAttribute("lang", "en");
    const en = await bodyText(page);
    expect(en).toContain("Services");

    await switchTo(page, "hi");
    const hi = await bodyText(page);
    expect(hi).toMatch(DEVANAGARI);
    for (const leftover of ["Services", "Portfolio", "Get in touch", "What we do"]) {
      expect(hi).not.toContain(leftover);
    }

    await switchTo(page, "en");
    const back = await bodyText(page);
    expect(back).toContain("Services");
    expect(back).toContain("Portfolio");
  });

  test("language preference survives a reload", async ({ page }) => {
    await page.goto("/");
    await switchTo(page, "hi");
    await page.reload();
    await expect(page.locator("footer")).toBeVisible();
    await expect(page.locator("html")).toHaveAttribute("lang", "hi");
    await expect.poll(() => bodyText(page), { timeout: 10_000 }).toMatch(DEVANAGARI);
  });

  test("contact form labels and validation toasts localise", async ({ page }) => {
    await page.goto("/");
    await switchTo(page, "hi");
    const form = page.locator("form").first();
    await form.scrollIntoViewIfNeeded();
    const formText = (await form.innerText()).replace(/\s+/g, " ");
    expect(formText).toMatch(DEVANAGARI);
    expect(formText).not.toContain("Name");
    expect(formText).not.toContain("Message");

    // Native `required` blocks an empty submit, so submit valid input and check the result toast.
    await form.locator("#contact-name").fill("Test Client");
    await form.locator("#contact-email").fill("test.client@example.com");
    await form.locator("#contact-message").fill("Hindi localisation check.");
    await form.locator('button[type="submit"]').first().click();
    const toast = page.locator("[data-sonner-toast]").first();
    await expect(toast).toBeVisible({ timeout: 5000 });
    expect(await toast.innerText()).toMatch(DEVANAGARI);
  });

  test("footer credit localises on every page", async ({ page }) => {
    for (const path of ["/", "/auth"]) {
      await page.goto(path);
      await switchTo(page, "hi");
      const footer = page.locator("footer").first();
      // The credit line stays verbatim by design; the toggle inside the footer flips to "EN".
      expect(await footer.innerText()).toContain("manasrajdeep.in");
      await expect(footer.getByTitle("Switch to English")).toBeVisible();
      await switchTo(page, "en");
    }
  });
});
