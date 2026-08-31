import { test, expect, type Page } from "@playwright/test";

/**
 * Cross-browser / cross-breakpoint layout guard: no horizontal overflow and no
 * pinch-zoom-inducing layout on the homepage, the portal, or the case study
 * modal. Run against every configured project (Chromium + WebKit for iOS).
 */
const BREAKPOINTS = [
  { name: "iphone-se", width: 320, height: 568 },
  { name: "android", width: 360, height: 800 },
  { name: "iphone-14", width: 390, height: 844 },
  { name: "iphone-plus", width: 414, height: 896 },
  { name: "tablet", width: 768, height: 1024 },
  { name: "desktop", width: 1280, height: 900 },
];

async function assertNoHorizontalOverflow(page: Page, label: string) {
  const res = await page.evaluate(() => ({
    scrollWidth: document.documentElement.scrollWidth,
    inner: window.innerWidth,
  }));
  expect(res.scrollWidth, `${label} horizontal overflow`).toBeLessThanOrEqual(res.inner + 1);
}

for (const bp of BREAKPOINTS) {
  test(`homepage fits ${bp.name} (${bp.width}px) with no horizontal scroll`, async ({ page }) => {
    await page.setViewportSize({ width: bp.width, height: bp.height });
    await page.goto("/");
    await page.waitForLoadState("load");
    await assertNoHorizontalOverflow(page, `home ${bp.name} top`);
    await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
    await page.waitForTimeout(600);
    await assertNoHorizontalOverflow(page, `home ${bp.name} bottom`);

    // zoom-safe viewport: scalable, and no control smaller than 16px text
    const viewport = await page.locator('meta[name="viewport"]').getAttribute("content");
    expect(viewport).toContain("width=device-width");
    expect(viewport).not.toContain("user-scalable=no");
    expect(viewport).not.toContain("maximum-scale=1");

    if (bp.width < 768) {
      const smallInputs = await page.evaluate(
        () =>
          [...document.querySelectorAll("input:not([type=range]), textarea, select")].filter(
            (el) => parseFloat(getComputedStyle(el).fontSize) < 16,
          ).length,
      );
      // iOS Safari auto-zooms when a focused field is under 16px
      expect(smallInputs, "sub-16px form controls").toBe(0);
    }
  });

  test(`case study modal fits ${bp.name} without zooming`, async ({ page }) => {
    await page.setViewportSize({ width: bp.width, height: bp.height });
    await page.goto("/");
    await page.waitForLoadState("load");

    const card = page.locator("button[aria-label^='Open case study']").first();
    await card.scrollIntoViewIfNeeded();

    const dialog = page.getByRole("dialog");
    // React may not have hydrated the click handler yet on a cold dev bundle,
    // so retry the open until the dialog actually mounts.
    await expect(async () => {
      await card.click();
      await expect(dialog).toBeVisible({ timeout: 2000 });
    }).toPass({ timeout: 30_000 });

    const box = await dialog.evaluate((el) => {
      const r = el.getBoundingClientRect();
      const img = el.querySelector("img");
      return {
        h: r.height,
        w: r.width,
        winH: window.innerHeight,
        winW: window.innerWidth,
        imgH: img ? img.getBoundingClientRect().height : 0,
        scrollTop: el.scrollTop,
        bodyText: el.textContent?.length ?? 0,
      };
    });

    expect(box.h).toBeLessThanOrEqual(box.winH + 1);
    expect(box.w).toBeLessThanOrEqual(box.winW + 1);
    // opens at the top so the case study copy is readable immediately
    expect(box.scrollTop).toBe(0);
    // image never eats more than half the panel, leaving the study readable
    expect(box.imgH).toBeLessThan(box.h * 0.55);
    expect(box.bodyText).toBeGreaterThan(200);
    await assertNoHorizontalOverflow(page, `modal ${bp.name}`);
  });
}

test("portal fits narrow phones with no horizontal scroll", async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 568 });
  await page.goto("/portal");
  await page.waitForLoadState("load");
  await assertNoHorizontalOverflow(page, "portal 320px");
  await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
  await page.waitForTimeout(600);
  await assertNoHorizontalOverflow(page, "portal 320px bottom");
});
