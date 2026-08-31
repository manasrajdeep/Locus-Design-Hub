import { createFileRoute } from "@tanstack/react-router";
import type {} from "@tanstack/react-start";
import { SITE_URL } from "@/lib/site";

interface SitemapEntry {
  path: string;
  lastmod?: string;
  changefreq?: "always" | "hourly" | "daily" | "weekly" | "monthly" | "yearly" | "never";
  priority?: string;
}

/**
 * The homepage is fully CMS-driven, so its <lastmod> comes from the authoritative
 * homepage_content.updated_at timestamp — never from build/request time.
 */
async function fetchHomepageLastmod(): Promise<string | undefined> {
  const url = import.meta.env.VITE_SUPABASE_URL;
  const key = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;
  if (!url || !key) return undefined;
  try {
    const res = await fetch(
      `${url}/rest/v1/homepage_content?select=updated_at&order=updated_at.desc&limit=1`,
      { headers: { apikey: key, Accept: "application/json" } },
    );
    if (!res.ok) return undefined;
    const rows = (await res.json()) as Array<{ updated_at?: string }>;
    const updatedAt = rows?.[0]?.updated_at;
    return updatedAt ? new Date(updatedAt).toISOString() : undefined;
  } catch {
    return undefined;
  }
}

export const Route = createFileRoute("/sitemap.xml")({
  server: {
    handlers: {
      GET: async () => {
        const homeLastmod = await fetchHomepageLastmod();

        const entries: SitemapEntry[] = [
          { path: "/", lastmod: homeLastmod, changefreq: "weekly", priority: "1.0" },
        ];

        const urls = entries.map((e) =>
          [
            `  <url>`,
            `    <loc>${SITE_URL}${e.path}</loc>`,
            e.lastmod ? `    <lastmod>${e.lastmod}</lastmod>` : null,
            e.changefreq ? `    <changefreq>${e.changefreq}</changefreq>` : null,
            e.priority ? `    <priority>${e.priority}</priority>` : null,
            `  </url>`,
          ]
            .filter(Boolean)
            .join("\n"),
        );

        const xml = [
          `<?xml version="1.0" encoding="UTF-8"?>`,
          `<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">`,
          ...urls,
          `</urlset>`,
        ].join("\n");

        return new Response(xml, {
          headers: {
            "Content-Type": "application/xml",
            "Cache-Control": "public, max-age=300",
          },
        });
      },
    },
  },
});
