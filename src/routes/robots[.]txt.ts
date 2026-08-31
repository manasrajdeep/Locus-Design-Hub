import { createFileRoute } from "@tanstack/react-router";
import { SITEMAP_URL } from "@/lib/site";

/**
 * Served dynamically so the `Sitemap:` line always matches the canonical origin
 * in src/lib/site.ts. As a static public/robots.txt it silently drifted out of
 * sync with the canonical tag and the sitemap's own <loc> entries.
 */
const DISALLOWED = ["/portal", "/admin", "/superadmin", "/auth", "/pending", "/diagnostics"];

export const Route = createFileRoute("/robots.txt")({
  server: {
    handlers: {
      GET: () => {
        const body = [
          "User-agent: *",
          "Allow: /",
          ...DISALLOWED.map((path) => `Disallow: ${path}`),
          "",
          `Sitemap: ${SITEMAP_URL}`,
          "",
        ].join("\n");

        return new Response(body, {
          headers: {
            "Content-Type": "text/plain; charset=utf-8",
            "Cache-Control": "public, max-age=300",
          },
        });
      },
    },
  },
});
