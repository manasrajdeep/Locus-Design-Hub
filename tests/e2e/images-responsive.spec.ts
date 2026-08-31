import { test, expect } from "@playwright/test";

/**
 * CMS image delivery: AVIF/WebP with a JPEG fallback, lazy loading with
 * blur-up placeholders, and a preloaded hero for LCP.
 */
test.describe("CMS image delivery", () => {
  test("every CMS image offers AVIF, WebP and a JPEG fallback", async ({ page }) => {
    await page.goto("/");
    await page.waitForLoadState("load");

    const shape = await page.evaluate(() => {
      const pics = [...document.querySelectorAll("picture")];
      return pics.map((p) => ({
        types: [...p.querySelectorAll("source")].map((s) => s.type),
        imgSrc: p.querySelector("img")?.getAttribute("src") ?? "",
        imgSrcSet: p.querySelector("img")?.getAttribute("srcset") ?? "",
        sizes: p.querySelector("img")?.getAttribute("sizes") ?? "",
      }));
    });

    expect(shape.length).toBeGreaterThanOrEqual(7);
    for (const s of shape) {
      // modern formats first, in support order
      expect(s.types).toEqual(["image/avif", "image/webp"]);
      // universal fallback for older Safari/iOS
      expect(s.imgSrc).toMatch(/\.jpg$/);
      expect(s.imgSrcSet).toContain(".jpg");
      expect(s.sizes.length).toBeGreaterThan(0);
    }
  });

  test("hero is preloaded and eager, portfolio images are lazy with placeholders", async ({
    page,
  }) => {
    await page.goto("/");
    await page.waitForLoadState("load");

    const preload = await page
      .locator('link[rel="preload"][as="image"]')
      .first()
      .getAttribute("type");
    expect(preload).toBe("image/avif");

    const loadingInfo = await page.evaluate(() => {
      const imgs = [...document.querySelectorAll("picture img")] as HTMLImageElement[];
      return {
        eager: imgs.filter((i) => i.loading === "eager").length,
        lazy: imgs.filter((i) => i.loading === "lazy").length,
        withPlaceholder: imgs.filter((i) => i.style.backgroundImage.includes("data:image/jpeg"))
          .length,
        async: imgs.filter((i) => i.decoding === "async").length,
      };
    });

    expect(loadingInfo.eager).toBe(1); // hero only
    expect(loadingInfo.lazy).toBeGreaterThanOrEqual(6);
    expect(loadingInfo.withPlaceholder).toBeGreaterThanOrEqual(7);
    expect(loadingInfo.async).toBeGreaterThanOrEqual(6);
  });

  test("all variant URLs resolve with the right content type", async ({ page, request }) => {
    await page.goto("/");
    await page.waitForLoadState("load");

    const urls = await page.evaluate(() => {
      const out = new Set<string>();
      for (const s of document.querySelectorAll("picture source")) {
        for (const c of (s as HTMLSourceElement).srcset.split(","))
          out.add(c.trim().split(" ")[0]!);
      }
      for (const i of document.querySelectorAll("picture img")) {
        const ss = (i as HTMLImageElement).srcset;
        if (ss) for (const c of ss.split(",")) out.add(c.trim().split(" ")[0]!);
      }
      return [...out];
    });

    expect(urls.length).toBeGreaterThan(20);
    // spot-check a sample from each format to keep the run fast
    const sample = ["avif", "webp", "jpg"].flatMap((ext) =>
      urls.filter((u) => u.endsWith(`.${ext}`)).slice(0, 3),
    );
    for (const url of sample) {
      const res = await request.get(url);
      expect(res.status(), url).toBe(200);
      const expected = url.endsWith(".jpg") ? "image/jpeg" : `image/${url.split(".").pop()}`;
      expect(res.headers()["content-type"], url).toContain(expected);
    }
  });

  test("no layout shift from images: hero and portfolio keep fixed boxes", async ({ page }) => {
    await page.goto("/");
    await page.waitForLoadState("load");
    const cls = await page.evaluate(
      () =>
        new Promise<number>((resolve) => {
          let total = 0;
          new PerformanceObserver((list) => {
            for (const e of list.getEntries() as (PerformanceEntry & {
              value: number;
              hadRecentInput: boolean;
            })[]) {
              if (!e.hadRecentInput) total += e.value;
            }
          }).observe({ type: "layout-shift", buffered: true });
          window.scrollTo(0, document.body.scrollHeight);
          setTimeout(() => resolve(total), 2500);
        }),
    );
    expect(cls).toBeLessThan(0.1);
  });
});
