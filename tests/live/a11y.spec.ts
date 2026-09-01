import { test, expect } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";

/**
 * Accessibility audit of the public pages against WCAG 2 A/AA.
 *
 * Public only: the portal and admin need a session, and signing in here would
 * make an accessibility run depend on live credentials.
 */
const PAGES = ["/", "/auth", "/pending"];

for (const path of PAGES) {
  test(`${path} has no WCAG A/AA violations`, async ({ page }) => {
    await page.goto(path);
    await page.waitForLoadState("networkidle");

    const results = await new AxeBuilder({ page })
      .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"])
      .analyze();

    if (results.violations.length) {
      console.log(`\n${path} — ${results.violations.length} violation(s):`);
      for (const v of results.violations) {
        console.log(`  [${v.impact}] ${v.id}: ${v.help}`);
        for (const n of v.nodes.slice(0, 3)) console.log(`      ${n.html.slice(0, 110)}`);
      }
    }
    expect(results.violations).toEqual([]);
  });
}
