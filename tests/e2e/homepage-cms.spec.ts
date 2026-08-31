import { test, expect } from "@playwright/test";
import { adminClient, anonClient, hasPublicApi, hasServiceRole } from "./supabase-helpers";

type Content = {
  id: string;
  hero_title: string;
  hero_subtitle: string;
  hero_image_url: string;
  stats: { label: string; value: string }[];
  services: { title: string; description: string; icon?: string }[];
  portfolio: { image_url: string; caption?: string }[];
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

test.describe("homepage CMS content", () => {
  test.skip(!hasPublicApi, "Supabase public API env not available");

  test("hero, stats, services and portfolio render from the database", async ({ page }) => {
    const content = await readContent();

    await page.goto("/", { waitUntil: "domcontentloaded" });

    const h1 = page.locator("h1");
    await expect(h1).toHaveCount(1);
    await expect(h1).toHaveText(content.hero_title);
    await expect(page.getByText(content.hero_subtitle, { exact: false }).first()).toBeVisible();

    // Stats count up once scrolled into view, so bring the section in first.
    const statsSection = page.getByRole("region", { name: "Company metrics" });
    await statsSection.scrollIntoViewIfNeeded();
    for (const stat of content.stats) {
      await expect(statsSection.getByText(stat.label, { exact: false }).first()).toBeVisible();
      await expect(statsSection.getByText(stat.value, { exact: false }).first()).toBeVisible();
    }

    const services = page.locator("#services article");
    await expect(services).toHaveCount(content.services.length);
    for (const svc of content.services) {
      await expect(
        page.locator("#services").getByText(svc.title, { exact: false }).first(),
      ).toBeVisible();
    }

    const tiles = page.locator("#portfolio figure");
    await expect(tiles).toHaveCount(content.portfolio.length);
    await expect(
      page.locator("#portfolio").getByText(`${content.portfolio.length} documented builds`),
    ).toBeVisible();

    // Every CMS image URL must actually resolve (no broken hero/portfolio art).
    const badImages = await page.$$eval(
      "#portfolio img, header img",
      (nodes) =>
        nodes.filter(
          (n) => (n as HTMLImageElement).complete && (n as HTMLImageElement).naturalWidth === 0,
        ).length,
    );
    expect(badImages).toBe(0);
  });

  test("successive homepage_content updates are reflected on reload", async ({ page }) => {
    test.skip(!hasServiceRole, "service role key not available for CMS writes");
    const original = await readContent();
    const admin = adminClient();

    const revisions: Pick<Content, "hero_title" | "hero_subtitle" | "services" | "portfolio">[] = [
      {
        hero_title: `Revision One ${Date.now()}`,
        hero_subtitle: "First CMS revision applied by the E2E suite.",
        services: [
          {
            title: "Structural Design R1",
            description: "Frames, rafts and retaining systems.",
            icon: "Building2",
          },
          {
            title: "Site Execution R1",
            description: "Daily supervision and QA logs.",
            icon: "HardHat",
          },
        ],
        portfolio: [
          {
            image_url: original.portfolio[0]?.image_url ?? original.hero_image_url,
            caption: "R1 Tile A",
          },
          {
            image_url: original.portfolio[1]?.image_url ?? original.hero_image_url,
            caption: "R1 Tile B",
          },
          {
            image_url: original.portfolio[2]?.image_url ?? original.hero_image_url,
            caption: "R1 Tile C",
          },
        ],
      },
      {
        hero_title: `Revision Two ${Date.now()}`,
        hero_subtitle: "Second CMS revision with a different card and tile count.",
        services: [
          {
            title: "Turnkey Delivery R2",
            description: "Single-contract build management.",
            icon: "Building2",
          },
        ],
        portfolio: [{ image_url: original.hero_image_url, caption: "R2 Single Tile" }],
      },
    ];

    try {
      for (const rev of revisions) {
        const { error } = await admin.from("homepage_content").update(rev).eq("id", original.id);
        expect(error, `update failed: ${error?.message}`).toBeNull();

        await page.goto("/", { waitUntil: "domcontentloaded" });
        await expect(page.locator("h1")).toHaveText(rev.hero_title);
        await expect(page.getByText(rev.hero_subtitle, { exact: false }).first()).toBeVisible();
        await expect(page.locator("#services article")).toHaveCount(rev.services.length);
        await expect(
          page.locator("#services").getByText(rev.services[0]!.title, { exact: false }).first(),
        ).toBeVisible();
        await expect(page.locator("#portfolio figure")).toHaveCount(rev.portfolio.length);
        await expect(
          page.locator("#portfolio").getByText(`${rev.portfolio.length} documented builds`),
        ).toBeVisible();
      }
    } finally {
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
    }

    // Restoration must leave the public homepage exactly as it started.
    await page.goto("/", { waitUntil: "domcontentloaded" });
    await expect(page.locator("h1")).toHaveText(original.hero_title);
  });
});
