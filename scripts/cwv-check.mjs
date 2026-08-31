#!/usr/bin/env node
/**
 * Automated Lighthouse / Core Web Vitals gate for the CMS-driven pages.
 *
 * Run it after any CMS image or homepage content update:
 *   node scripts/cwv-check.mjs                      # against http://localhost:8080
 *   BASE_URL=https://your-domain.example node scripts/cwv-check.mjs
 *
 * Exits non-zero when LCP, CLS, TBT or the performance score regress past the
 * budgets below, so CI fails instead of silently shipping a slower homepage.
 */
import { spawn } from "node:child_process";
import { mkdirSync, readFileSync, rmSync } from "node:fs";
import path from "node:path";

const BASE_URL = process.env.BASE_URL ?? "http://localhost:8080";
const OUT_DIR = process.env.CWV_OUT_DIR ?? "lighthouse-report";

/**
 * Two profiles, because the Vite dev server ships unminified React with HMR:
 * its script-evaluation cost swamps TBT/LCP and says nothing about the images.
 *   dev  — default on localhost; loose timing budgets, strict CLS + image audits.
 *   prod — used for any non-localhost BASE_URL (published/preview deploy).
 * Override with CWV_PROFILE=dev|prod.
 */
const PROFILE =
  process.env.CWV_PROFILE ?? (/localhost|127\.0\.0\.1/.test(BASE_URL) ? "dev" : "prod");

const LIMITS = {
  prod: {
    mobile: { lcp: 3200, cls: 0.1, tbt: 600, score: 0.75 },
    desktop: { lcp: 2000, cls: 0.1, tbt: 350, score: 0.85 },
  },
  dev: {
    mobile: { lcp: 2600, cls: 0.1, tbt: 2600, score: 0.25 },
    desktop: { lcp: 2000, cls: 0.1, tbt: 700, score: 0.5 },
  },
}[PROFILE];

if (!LIMITS) {
  console.error(`Unknown CWV_PROFILE "${PROFILE}" — use dev or prod.`);
  process.exit(1);
}

/** CLS and the image audits are the regression gate; timings scale by profile. */
const BUDGETS = [
  { url: "/", label: "homepage (mobile)", preset: "mobile", limits: LIMITS.mobile },
  { url: "/", label: "homepage (desktop)", preset: "desktop", limits: LIMITS.desktop },
];

function runLighthouse(url, preset, jsonPath) {
  const args = [
    "--bun",
    "lighthouse@12",
    url,
    "--quiet",
    "--only-categories=performance",
    "--output=json",
    `--output-path=${jsonPath}`,
    "--chrome-flags=--headless=new --no-sandbox --disable-dev-shm-usage",
  ];
  if (preset === "desktop") args.push("--preset=desktop");
  return new Promise((resolve, reject) => {
    const child = spawn("bunx", args, { stdio: ["ignore", "inherit", "inherit"] });
    child.on("error", reject);
    child.on("exit", (code) =>
      code === 0 ? resolve() : reject(new Error(`lighthouse exited with ${code}`)),
    );
  });
}

const ms = (n) => `${Math.round(n)}ms`;
const rows = [];
let failed = false;

mkdirSync(OUT_DIR, { recursive: true });
console.log(`Core Web Vitals profile: ${PROFILE} (base ${BASE_URL})`);

for (const budget of BUDGETS) {
  const jsonPath = path.join(OUT_DIR, `${budget.preset}.json`);
  rmSync(jsonPath, { force: true });
  const target = new URL(budget.url, BASE_URL).toString();
  console.log(`\n▶ Lighthouse ${budget.label} — ${target}`);
  await runLighthouse(target, budget.preset, jsonPath);

  const report = JSON.parse(readFileSync(jsonPath, "utf8"));
  const audits = report.audits;
  const observed = audits["metrics"]?.details?.items?.[0] ?? {};
  const actual = {
    // On the dev server Lighthouse's *simulated* throttling extrapolates from
    // unminified vendor bundles (lucide-react ~1 MB, supabase ~700 KB) and
    // reports tens of seconds for a page that paints in ~1.5s. Use the observed
    // trace values in the dev profile; keep the simulated ones for prod, which
    // is what Google's field data resembles.
    lcp:
      PROFILE === "dev" && observed.observedLargestContentfulPaint
        ? observed.observedLargestContentfulPaint
        : audits["largest-contentful-paint"].numericValue,
    cls: audits["cumulative-layout-shift"].numericValue,
    tbt: audits["total-blocking-time"].numericValue,
    score: report.categories.performance.score,
  };

  const checks = [
    ["LCP", actual.lcp, budget.limits.lcp, ms, (a, l) => a <= l],
    ["CLS", actual.cls, budget.limits.cls, (v) => v.toFixed(3), (a, l) => a <= l],
    ["TBT", actual.tbt, budget.limits.tbt, ms, (a, l) => a <= l],
    ["Perf score", actual.score, budget.limits.score, (v) => v.toFixed(2), (a, l) => a >= l],
  ];

  for (const [name, value, limit, fmt, ok] of checks) {
    const pass = ok(value, limit);
    if (!pass) failed = true;
    rows.push(
      `${pass ? "PASS" : "FAIL"}  ${budget.label.padEnd(20)} ${name.padEnd(11)} ${fmt(value).padStart(9)}  (budget ${fmt(limit)})`,
    );
  }

  // Extra image-specific signal: modern formats + correctly sized images.
  for (const id of [
    "modern-image-formats",
    "uses-responsive-images",
    "efficient-animated-content",
  ]) {
    const audit = audits[id];
    if (!audit) continue;
    const savings = audit.details?.overallSavingsBytes ?? 0;
    // AVIF/WebP + srcset are in place, so anything above 40 KiB of headroom
    // means a CMS image shipped without its variants.
    const pass = savings / 1024 <= 40;
    if (!pass) failed = true;
    rows.push(
      `${pass ? "PASS" : "FAIL"}  ${budget.label.padEnd(20)} ${id.padEnd(26)} headroom ${(savings / 1024).toFixed(0).padStart(4)} KiB (budget 40 KiB)`,
    );
  }
}

console.log(`\nCore Web Vitals summary (reports in ${OUT_DIR}/)\n${"-".repeat(78)}`);
for (const row of rows) console.log(row);

if (failed) {
  console.error("\n✖ Core Web Vitals budget exceeded — see failures above.");
  process.exit(1);
}
console.log("\n✔ LCP, CLS, TBT and performance score all within budget.");
