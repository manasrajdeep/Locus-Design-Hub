import { test } from "@playwright/test";

test("debug provisioning", async ({ page }) => {
  const logs: string[] = [];
  page.on("console", (m) => logs.push(`console.${m.type()}: ${m.text().slice(0, 300)}`));
  page.on("pageerror", (e) => logs.push(`pageerror: ${e.message.slice(0, 300)}`));
  page.on("response", async (r) => {
    if (r.url().includes("_serverFn") || r.url().includes("provision")) {
      let body = "";
      try { body = (await r.text()).slice(0, 400); } catch { /* ignore */ }
      logs.push(`NET ${r.status()} ${r.url()}\n     body: ${body}`);
    }
  });

  await page.goto("/auth?staff=true");
  await page.locator("#email").fill("locus.design@locusdesign.com");
  await page.locator("#password").fill("LocusPortal!2026");
  await page.locator('button[type="submit"]').click();
  await page.waitForURL(/\/admin/, { timeout: 30_000 });

  await page.getByLabel("Client email").fill(`dbg-${Date.now()}@locusdesign.online`);
  await page.getByLabel("Client password").fill("reta-vusk-4839");
  await page.getByLabel("Project name").fill("Debug Project");
  await page.getByRole("button", { name: "Create client account" }).click();
  await page.waitForTimeout(8000);

  const toast = await page.locator("[data-sonner-toast]").allInnerTexts().catch(() => []);
  logs.push(`TOASTS: ${JSON.stringify(toast)}`);
  console.log("\n===== DEBUG =====\n" + logs.join("\n") + "\n=================");
});
