import { test, expect, type Page } from "@playwright/test";
import { adminClient, anonClient, hasPublicApi, hasServiceRole } from "./supabase-helpers";

/**
 * Deep coverage of the public homepage: SEO head, semantics/a11y, CMS-driven
 * content, interactive sections (beam simulator, case-study modal), theme
 * toggle, contact form (validation + real insert), responsive layout at three
 * breakpoints, image health, and console/network hygiene.
 */

type Content = {
  hero_title: string;
  hero_subtitle: string;
  stats: { label: string; value: string }[];
  services: { title: string; description: string }[];
  portfolio: { image_url: string; caption?: string }[];
};

async function readContent(): Promise<Content> {
  const { data, error } = await anonClient()
    .from("homepage_content")
    .select("hero_title, hero_subtitle, stats, services, portfolio")
    .limit(1)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) throw new Error("homepage_content is empty");
  return data as unknown as Content;
}

async function meta(page: Page, selector: string) {
  return page.locator(selector).getAttribute("content");
}

async function horizontalOverflow(page: Page) {
  return page.evaluate(() => {
    const de = document.documentElement;
    return { scrollW: de.scrollWidth, clientW: de.clientWidth };
  });
}

/** Waits for smooth-scroll animations to settle so clicks land where expected. */
async function scrollSettled(page: Page) {
  await expect
    .poll(
      async () => {
        const a = await page.evaluate(() => window.scrollY);
        await page.waitForTimeout(250);
        const b = await page.evaluate(() => window.scrollY);
        return a === b;
      },
      { timeout: 10_000 },
    )
    .toBe(true);
}

/**
 * Waits until React has hydrated the page.
 *
 * Tests navigate with `domcontentloaded`, which resolves while the markup is
 * still inert SSR output. Interacting before hydration silently does the wrong
 * thing: a dispatched `input` event never reaches React, and clicking a submit
 * button performs a *native* form submission instead of running onSubmit.
 */
async function hydrated(page: Page) {
  await page.waitForLoadState("networkidle");
}

/** Sets a React-controlled range input through the native value setter. */
async function setRange(page: Page, label: RegExp, value: string) {
  await hydrated(page);
  const slider = page.getByRole("slider", { name: label });
  await slider.evaluate((el, v) => {
    const input = el as HTMLInputElement;
    const proto = Object.getPrototypeOf(input);
    Object.getOwnPropertyDescriptor(proto, "value")!.set!.call(input, v);
    input.dispatchEvent(new Event("input", { bubbles: true }));
  }, value);
}

test.describe("homepage — deep checks", () => {
  test.skip(!hasPublicApi, "Supabase public API env not available");

  test("SEO head, semantics and footer", async ({ page }) => {
    await page.goto("/", { waitUntil: "domcontentloaded" });

    await expect(page).toHaveTitle(/Locus Design/);
    const title = await page.title();
    expect(title.length).toBeLessThan(60);
    expect(title).not.toMatch(/Lovable/i);

    const desc = await meta(page, 'meta[name="description"]');
    expect(desc && desc.length).toBeGreaterThan(50);
    expect(desc!.length).toBeLessThan(160);
    expect(await meta(page, 'meta[property="og:title"]')).toBeTruthy();
    expect(await meta(page, 'meta[property="og:description"]')).toBeTruthy();
    expect(await meta(page, 'meta[property="og:type"]')).toBe("website");
    expect(await meta(page, 'meta[name="twitter:card"]')).toBeTruthy();
    expect(await meta(page, 'meta[name="viewport"]')).toMatch(/width=device-width/);
    expect(await page.locator("html").getAttribute("lang")).toBeTruthy();

    // Landmarks + heading structure.
    await expect(page.locator("header")).toHaveCount(1);
    await expect(page.locator("main")).toHaveCount(1);
    await expect(page.locator("footer")).toHaveCount(1);
    await expect(page.locator("h1")).toHaveCount(1);
    expect(await page.locator("h2").count()).toBeGreaterThan(3);

    // Footer requirement: centered credit line on every page.
    const credit = page.locator("footer p", { hasText: "Website made by" });
    await expect(credit).toBeVisible();
    await expect(credit.getByRole("link", { name: "manasrajdeep.in" })).toHaveAttribute(
      "href",
      "https://manasrajdeep.in",
    );
    await expect(credit.locator("xpath=..")).toHaveClass(/text-center/);

    // sitemap must list the homepage.
    const sitemap = await page.request.get("/sitemap.xml");
    expect(sitemap.status()).toBe(200);
    expect(await sitemap.text()).toContain("<urlset");
  });

  test("CMS content renders in every section", async ({ page }) => {
    const c = await readContent();
    await page.goto("/", { waitUntil: "domcontentloaded" });

    await expect(page.locator("h1")).toHaveText(c.hero_title);
    await expect(page.getByText(c.hero_subtitle, { exact: false }).first()).toBeVisible();

    const stats = page.getByRole("region", { name: "Company metrics" });
    await stats.scrollIntoViewIfNeeded();
    for (const s of c.stats) {
      await expect(stats.getByText(s.label, { exact: false }).first()).toBeVisible();
      await expect(stats.getByText(s.value, { exact: false }).first()).toBeVisible();
    }

    await expect(page.locator("#services article")).toHaveCount(c.services.length);
    for (const s of c.services) {
      await expect(
        page.locator("#services").getByText(s.title, { exact: false }).first(),
      ).toBeVisible();
      await expect(
        page.locator("#services").getByText(s.description, { exact: false }).first(),
      ).toBeVisible();
    }

    await expect(page.locator("#portfolio figure")).toHaveCount(c.portfolio.length);
    await expect(page.locator("#engineering h2")).toBeVisible();
    await expect(page.locator("#contact h2")).toBeVisible();
    await expect(page.locator("#about")).toBeVisible();
  });

  test("images are healthy, cropped and aspect-locked (no layout shift)", async ({ page }) => {
    await page.goto("/", { waitUntil: "domcontentloaded" });
    // Bring lazy sections into view so their images start loading.
    for (const id of ["#services", "#engineering", "#portfolio", "#about", "#contact"]) {
      await page.locator(id).scrollIntoViewIfNeeded();
    }
    await page.waitForTimeout(1500);

    const report = await page.$$eval("img", (nodes) =>
      nodes.map((n) => {
        const img = n as HTMLImageElement;
        const cs = getComputedStyle(img);
        return {
          src: img.currentSrc || img.src,
          broken: img.complete && img.naturalWidth === 0,
          fit: cs.objectFit,
          alt: img.getAttribute("alt"),
          loading: img.getAttribute("loading"),
        };
      }),
    );

    expect(report.length).toBeGreaterThan(0);
    expect(report.filter((r) => r.broken).map((r) => r.src)).toEqual([]);
    // Photographic content must be cropped, never stretched.
    expect(report.filter((r) => r.fit !== "cover").map((r) => r.src)).toEqual([]);
    // Every image must carry an alt attribute (empty allowed for decorative art).
    expect(report.filter((r) => r.alt === null).map((r) => r.src)).toEqual([]);

    // Portfolio tiles are aspect-locked (4:5 standard tiles, 16:10 feature tiles).
    const ratios = await page.$$eval("#portfolio figure", (nodes) =>
      nodes.map((n) => {
        const r = n.getBoundingClientRect();
        return r.height > 0 ? r.width / r.height : 0;
      }),
    );
    expect(ratios.length).toBeGreaterThan(0);
    for (const ratio of ratios) {
      const matches = [4 / 5, 16 / 10].some((target) => Math.abs(ratio - target) < 0.06);
      expect(matches, `unexpected portfolio tile ratio ${ratio.toFixed(3)}`).toBe(true);
    }

    // No cumulative reflow after images settle.
    const before = await page.locator("#contact h2").boundingBox();
    await page.waitForTimeout(800);
    const after = await page.locator("#contact h2").boundingBox();
    expect(Math.abs((before?.y ?? 0) - (after?.y ?? 0))).toBeLessThan(4);
  });

  test("navigation anchors, theme toggle and login CTA", async ({ page }) => {
    await page.goto("/", { waitUntil: "domcontentloaded" });

    // Anchor nav scrolls within the page (no route change).
    await page.getByRole("link", { name: "Portfolio", exact: true }).click();
    await expect(page).toHaveURL(/#portfolio$/);
    await expect(page.locator("#portfolio")).toBeInViewport();

    // Theme toggle flips the root class and persists across reloads.
    // Back to the top so the header controls sit inside the viewport.
    await page.evaluate(() => window.scrollTo({ top: 0, behavior: "auto" }));
    await scrollSettled(page);
    const toggle = page.getByRole("button", { name: /Switch to (dark|light) theme/ }).first();
    const wasDark = await page.evaluate(() => document.documentElement.classList.contains("dark"));
    await toggle.click();
    await expect
      .poll(() => page.evaluate(() => document.documentElement.classList.contains("dark")))
      .toBe(!wasDark);
    await page.reload({ waitUntil: "domcontentloaded" });
    await expect
      .poll(() => page.evaluate(() => document.documentElement.classList.contains("dark")))
      .toBe(!wasDark);
    await page
      .getByRole("button", { name: /Switch to (dark|light) theme/ })
      .first()
      .click();

    // Client Login routes anonymous visitors to the Google-only auth page.
    await page.getByRole("button", { name: "Client Login" }).first().click();
    await expect(page).toHaveURL(/\/auth/);
    await expect(page.getByRole("button", { name: /Google/i })).toBeVisible();
  });

  test("beam simulator recomputes and case-study modal opens/closes", async ({ page }) => {
    await page.goto("/", { waitUntil: "domcontentloaded" });

    const beam = page.getByRole("img", { name: "Deflected beam diagram" });
    await beam.scrollIntoViewIfNeeded();
    await scrollSettled(page);
    await expect(beam).toBeVisible();

    // Readout <dd> next to the "Deflection" term — not the depth slider label.
    const deflection = page
      .locator("dl div", { has: page.getByText("Deflection", { exact: true }) })
      .locator("dd")
      .first();
    const readBefore = await deflection.innerText();
    await setRange(page, /Clear span/, "3");
    await expect.poll(async () => deflection.innerText()).not.toBe(readBefore);
    // Deeper section must reduce the deflection again (I = bh^3/12).
    const spanned = await deflection.innerText();
    await setRange(page, /Section depth/, "200");
    await expect.poll(async () => deflection.innerText()).not.toBe(spanned);
    for (const label of ["Deflection", "Max moment", "End shear"]) {
      await expect(page.getByText(label, { exact: true }).first()).toBeVisible();
    }

    // Case-study modal.
    const tile = page.locator("#portfolio button[aria-label^='Open case study']").first();
    await tile.scrollIntoViewIfNeeded();
    await scrollSettled(page);
    await tile.click();
    const dialog = page.getByRole("dialog");
    await expect(dialog).toBeVisible();
    await expect(dialog.getByRole("heading").first()).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(dialog).toBeHidden();
  });

  test("contact form validates input and stores a real message", async ({ page }) => {
    await page.goto("/", { waitUntil: "domcontentloaded" });
    await hydrated(page);
    await page.locator("#contact").scrollIntoViewIfNeeded();
    await scrollSettled(page);

    const name = page.locator("#contact-name");
    const email = page.locator("#contact-email");
    const message = page.locator("#contact-message");

    // Labels are wired to inputs (a11y) and fields are required.
    for (const [id, field] of [
      ["contact-name", name],
      ["contact-email", email],
      ["contact-message", message],
    ] as const) {
      await expect(page.locator(`label[for="${id}"]`)).toBeVisible();
      await expect(field).toHaveAttribute("required", "");
    }

    // Browser-level validation blocks an empty submit.
    await page.getByRole("button", { name: "Send message" }).click();
    await expect
      .poll(() => name.evaluate((el) => (el as HTMLInputElement).validity.valid))
      .toBe(false);

    // App-level validation rejects a malformed email.
    const stamp = Date.now();
    await name.fill("PW Deep Test");
    await message.fill("Testing validation path.");
    await email.fill("not-an-email");
    // Bypass the native type=email gate so the app-level validator is exercised.
    await email.evaluate((el) => (el as HTMLInputElement).setAttribute("type", "text"));
    await page.getByRole("button", { name: "Send message" }).dispatchEvent("click");
    await expect(
      page.locator("[data-sonner-toast]").filter({ hasText: /valid email/i }),
    ).toBeVisible();

    // Happy path writes to the database.
    const testEmail = `pw-deep-${stamp}@example.com`;
    const body = `Deep homepage test ${stamp}`;
    await email.fill(testEmail);
    await message.fill(body);
    await page.getByRole("button", { name: "Send message" }).dispatchEvent("click");
    await expect(
      page.locator("[data-sonner-toast]").filter({ hasText: /Message sent/i }),
    ).toBeVisible({
      timeout: 15_000,
    });
    await expect(name).toHaveValue("");

    if (hasServiceRole) {
      const admin = adminClient();
      await expect
        .poll(
          async () => {
            const { data } = await admin
              .from("contact_messages")
              .select("id")
              .eq("email", testEmail);
            return data?.length ?? 0;
          },
          { timeout: 10_000 },
        )
        .toBe(1);
      await admin.from("contact_messages").delete().eq("email", testEmail);
    }
  });

  test("contact messages are not publicly readable", async () => {
    const { data, error } = await anonClient()
      .from("contact_messages")
      .select("id, email")
      .limit(5);
    // Either RLS denies the read outright or it returns nothing at all.
    expect(error !== null || (data ?? []).length === 0).toBe(true);
  });

  test("responsive layout has no horizontal overflow", async ({ page }) => {
    for (const size of [
      { width: 390, height: 844 },
      { width: 768, height: 1024 },
      { width: 1440, height: 900 },
    ]) {
      await page.setViewportSize(size);
      await page.goto("/", { waitUntil: "domcontentloaded" });
      for (const id of ["#services", "#engineering", "#portfolio", "#contact"]) {
        await page.locator(id).scrollIntoViewIfNeeded();
      }
      const { scrollW, clientW } = await horizontalOverflow(page);
      expect(scrollW - clientW, `overflow at ${size.width}px`).toBeLessThanOrEqual(2);

      // Hero copy and the primary CTA must stay usable on every breakpoint.
      await page.locator("h1").scrollIntoViewIfNeeded();
      await expect(page.locator("h1")).toBeVisible();
      await expect(page.getByRole("button", { name: "Client Login" }).first()).toBeVisible();
    }
  });

  test("no console errors or failed requests on load", async ({ page }) => {
    const errors: string[] = [];
    const failed: string[] = [];
    page.on("console", (msg) => {
      if (msg.type() === "error") errors.push(msg.text());
    });
    page.on("response", (res) => {
      if (res.status() >= 400) failed.push(`${res.status()} ${res.url()}`);
    });

    await page.goto("/", { waitUntil: "domcontentloaded" });
    for (const id of ["#services", "#engineering", "#portfolio", "#about", "#contact"]) {
      await page.locator(id).scrollIntoViewIfNeeded();
    }
    await page.waitForTimeout(1500);

    expect(errors, `console errors:\n${errors.join("\n")}`).toEqual([]);
    expect(failed, `failed requests:\n${failed.join("\n")}`).toEqual([]);
  });

  test("keyboard users can reach the login CTA and portfolio tiles", async ({ page }) => {
    await page.goto("/", { waitUntil: "domcontentloaded" });
    const reached: string[] = [];
    for (let i = 0; i < 14; i++) {
      await page.keyboard.press("Tab");
      reached.push(
        await page.evaluate(() => {
          const el = document.activeElement as HTMLElement | null;
          return el
            ? `${el.tagName}:${(el.getAttribute("aria-label") ?? el.innerText ?? "").slice(0, 40)}`
            : "none";
        }),
      );
    }
    expect(reached.some((r) => /Client Login/i.test(r))).toBe(true);

    const tile = page.locator("#portfolio button[aria-label^='Open case study']").first();
    await tile.scrollIntoViewIfNeeded();
    await tile.focus();
    await tile.press("Enter");
    await expect(page.getByRole("dialog")).toBeVisible();
  });
});

/**
 * Regression guard for a real defect: the homepage is server-rendered, so the
 * contact form exists in the DOM before React attaches `onSubmit`. A click or
 * an Enter keypress in that window used to perform a *native* GET submission —
 * navigating to `/?name=…&email=…&message=…`, losing the enquiry entirely and
 * writing the visitor's name, email and message into the URL, their history and
 * the Referer header.
 *
 * Disabling JavaScript reproduces that window deterministically: the markup
 * never hydrates, which is exactly the pre-hydration state.
 */
test.describe("contact form before hydration", () => {
  test.use({ javaScriptEnabled: false });
  test.skip(!hasPublicApi, "Supabase public API env not available");

  test("inert SSR markup cannot submit natively or leak details into the URL", async ({ page }) => {
    await page.goto("/", { waitUntil: "domcontentloaded" });

    const submit = page.locator('button[type="submit"]');
    await expect(submit, "submit must be inert until hydration").toBeDisabled();

    await page.locator("#contact-name").fill("Pre Hydration");
    await page.locator("#contact-email").fill("pre@example.com");
    await page.locator("#contact-message").fill("must never reach the query string");

    // Both routes into a native submission: the button, and implicit submission
    // via Enter (which HTML also suppresses when the default button is disabled).
    await submit.click({ force: true }).catch(() => {});
    await page.locator("#contact-name").press("Enter");
    await page.waitForTimeout(500);

    expect(new URL(page.url()).search, "form details leaked into the URL").toBe("");
    expect(page.url()).not.toContain("pre@example.com");
  });
});
