import { defineConfig, devices } from "@playwright/test";
import { readFileSync } from "node:fs";

// Load .env (gitignored) so LIVE_ADMIN_* never has to live in the repo.
try {
  for (const line of readFileSync(".env", "utf8").split("\n")) {
    const m = /^([A-Z_]+)=(.*)$/.exec(line.trim());
    if (m && !process.env[m[1]!]) process.env[m[1]!] = m[2]!.replace(/^"|"$/g, "");
  }
} catch {
  /* no .env — the specs skip themselves */
}

/**
 * Smoke tests that run against the deployed site.
 *
 * Deliberately a separate config from playwright.config.ts. These sign in as a
 * real admin and create real accounts, so they must never be swept up by the
 * ordinary suite — `bun run test:e2e` would then be writing to production every
 * time anyone ran it. Invoke explicitly: `bun run test:live`.
 */
export default defineConfig({
  testDir: "./tests/live",
  timeout: 120_000,
  expect: { timeout: 20_000 },
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: [["list"]],
  use: {
    baseURL: process.env["LIVE_URL"] ?? "https://locusdesign.online",
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
});
