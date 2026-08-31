import { defineConfig, devices } from "@playwright/test";

const PORT = Number(process.env["E2E_PORT"] ?? 8080);
const baseURL = process.env["E2E_BASE_URL"] ?? `http://localhost:${PORT}`;

/**
 * Disposable Supabase project for the suite.
 *
 * tenant-isolation and superadmin-cms seed real users, projects, storage
 * objects and homepage content, then assert on them *through the running app*.
 * That only works if the app under test talks to the same project the seeding
 * went into — so when a disposable project is configured, the dev server is
 * launched pointed at it rather than at whatever `.env` holds.
 *
 * Without this the two would diverge: seed into the disposable project, then
 * assert against production.
 */
const disposableUrl = process.env["E2E_SUPABASE_URL"] ?? process.env["RLS_AUDIT_SUPABASE_URL"];
const disposableKey =
  process.env["E2E_SUPABASE_PUBLISHABLE_KEY"] ?? process.env["RLS_AUDIT_SUPABASE_PUBLISHABLE_KEY"];

function projectRef(url: string): string {
  try {
    return new URL(url).hostname.split(".")[0] ?? "";
  } catch {
    return "";
  }
}

const devServerEnv =
  disposableUrl && disposableKey
    ? {
        VITE_SUPABASE_URL: disposableUrl,
        VITE_SUPABASE_PUBLISHABLE_KEY: disposableKey,
        VITE_SUPABASE_PROJECT_ID: projectRef(disposableUrl),
        SUPABASE_URL: disposableUrl,
        SUPABASE_PUBLISHABLE_KEY: disposableKey,
        SUPABASE_PROJECT_ID: projectRef(disposableUrl),
      }
    : {};

export default defineConfig({
  testDir: "./tests/e2e",
  timeout: 90_000,
  expect: { timeout: 15_000 },
  fullyParallel: false,
  workers: 1,
  retries: process.env["CI"] ? 1 : 0,
  reporter: process.env["CI"] ? [["list"], ["html", { open: "never" }]] : [["list"]],
  use: {
    baseURL,
    viewport: { width: 1280, height: 1200 },
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
  projects: [
    { name: "chromium", use: { ...devices["Desktop Chrome"] } },
    // Safari/iOS engine — layout + image-format fallbacks only, to keep CI quick.
    {
      name: "webkit-mobile",
      testMatch: /(responsive-layout|images-responsive)\.spec\.ts/,
      use: { ...devices["Desktop Safari"] },
    },
  ],

  webServer: process.env["E2E_NO_SERVER"]
    ? undefined
    : {
        command: "npm run dev",
        url: baseURL,
        // Playwright *replaces* the child environment when `env` is given, so
        // passing the overrides alone would launch the dev server without PATH
        // or HOME and it would never start. Layer them over the real
        // environment, and omit the key entirely when there is nothing to add.
        ...(Object.keys(devServerEnv).length
          ? {
              env: {
                ...(process.env as Record<string, string>),
                ...devServerEnv,
              },
            }
          : {}),
        // With a disposable project configured the server must be launched with
        // its credentials, so an already-running dev server (pointed at .env)
        // cannot be reused — it would serve the wrong project.
        reuseExistingServer: Object.keys(devServerEnv).length === 0,
        timeout: 120_000,
      },
});
