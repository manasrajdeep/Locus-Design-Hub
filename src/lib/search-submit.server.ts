/**
 * Server-only helpers that notify search engines the sitemap changed.
 *
 * Google:  Search Console API through the hosted connector gateway (the old
 *          anonymous /ping endpoint was retired, so a connected Search Console
 *          property is required).
 * Bing:    IndexNow, which Bing (and Yandex) accept with a key file hosted at
 *          the site root — no account linking needed.
 */

import { SITE_URL, SITEMAP_URL, INDEXNOW_KEY } from "@/lib/site";

const GATEWAY = "https://connector-gateway.lovable.dev/google_search_console";

export { SITE_URL, SITEMAP_URL, INDEXNOW_KEY } from "@/lib/site";

export interface SubmitOutcome {
  engine: "google" | "bing";
  status: "ok" | "skipped" | "failed" | "selection_required";
  detail: string;
  candidates?: string[];
}

interface SiteEntry {
  siteUrl: string;
  permissionLevel?: string;
}

function gatewayHeaders() {
  const lovableApiKey = process.env["LOVABLE_API_KEY"];
  const connectionApiKey = process.env["GOOGLE_SEARCH_CONSOLE_API_KEY"];
  if (!lovableApiKey || !connectionApiKey) return null;
  return {
    Authorization: `Bearer ${lovableApiKey}`,
    "X-Connection-Api-Key": connectionApiKey,
  };
}

function coversTarget(siteUrl: string, target: URL) {
  if (siteUrl.startsWith("sc-domain:")) {
    const domain = siteUrl.slice("sc-domain:".length).toLowerCase();
    const host = target.hostname.toLowerCase();
    return host === domain || host.endsWith(`.${domain}`);
  }
  try {
    return target.href.startsWith(new URL(siteUrl).href);
  } catch {
    return false;
  }
}

/** Lists the verified Search Console properties that cover this site. */
async function matchingProperties(headers: Record<string, string>): Promise<string[]> {
  const res = await fetch(`${GATEWAY}/webmasters/v3/sites`, { headers });
  if (!res.ok) {
    const body = await res.text();
    console.error(`Search Console site list failed [${res.status}]: ${body}`);
    throw new Error(`Could not list Search Console properties [${res.status}]: ${body}`);
  }
  const { siteEntry = [] } = (await res.json()) as { siteEntry?: SiteEntry[] };
  const target = new URL(SITE_URL);
  return siteEntry
    .filter((e) => e.permissionLevel !== "siteUnverifiedUser" && coversTarget(e.siteUrl, target))
    .map((e) => e.siteUrl);
}

/** Submits the sitemap to Google Search Console. */
export async function submitSitemapToGoogle(selectedSiteUrl?: string): Promise<SubmitOutcome> {
  const headers = gatewayHeaders();
  if (!headers) {
    return {
      engine: "google",
      status: "skipped",
      detail: "Google Search Console is not connected yet.",
    };
  }

  try {
    const matches = await matchingProperties(headers);
    if (matches.length === 0) {
      return {
        engine: "google",
        status: "failed",
        detail: "No verified Search Console property covers this site.",
      };
    }
    if (selectedSiteUrl && !matches.includes(selectedSiteUrl)) {
      return {
        engine: "google",
        status: "failed",
        detail: "The selected Search Console property is no longer verified for this site.",
      };
    }
    if (!selectedSiteUrl && matches.length > 1) {
      return {
        engine: "google",
        status: "selection_required",
        detail: "Several verified properties cover this site — pick one.",
        candidates: matches,
      };
    }
    const siteUrl = selectedSiteUrl ?? matches[0];

    const res = await fetch(
      `${GATEWAY}/webmasters/v3/sites/${encodeURIComponent(siteUrl)}/sitemaps/${encodeURIComponent(SITEMAP_URL)}`,
      { method: "PUT", headers },
    );
    if (!res.ok) {
      const body = await res.text();
      console.error(`Sitemap submit failed [${res.status}]: ${body}`);
      return {
        engine: "google",
        status: "failed",
        detail: `Google rejected the sitemap [${res.status}]: ${body}`,
      };
    }
    return { engine: "google", status: "ok", detail: `Sitemap submitted for ${siteUrl}.` };
  } catch (err) {
    return {
      engine: "google",
      status: "failed",
      detail: err instanceof Error ? err.message : "Unknown Search Console error",
    };
  }
}

/** Tells Bing (via IndexNow) that the homepage and sitemap changed. */
export async function submitToBing(
  urls: string[] = [`${SITE_URL}/`, SITEMAP_URL],
): Promise<SubmitOutcome> {
  try {
    const res = await fetch("https://api.indexnow.org/indexnow", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        host: new URL(SITE_URL).hostname,
        key: INDEXNOW_KEY,
        keyLocation: `${SITE_URL}/${INDEXNOW_KEY}.txt`,
        urlList: urls,
      }),
    });
    if (!res.ok) {
      const body = await res.text();
      console.error(`IndexNow submit failed [${res.status}]: ${body}`);
      return {
        engine: "bing",
        status: "failed",
        detail: `Bing rejected the ping [${res.status}]: ${body}`,
      };
    }
    return { engine: "bing", status: "ok", detail: "Bing notified through IndexNow." };
  } catch (err) {
    return {
      engine: "bing",
      status: "failed",
      detail: err instanceof Error ? err.message : "Unknown IndexNow error",
    };
  }
}

export async function submitSitemapEverywhere(selectedSiteUrl?: string): Promise<SubmitOutcome[]> {
  return Promise.all([submitSitemapToGoogle(selectedSiteUrl), submitToBing()]);
}
