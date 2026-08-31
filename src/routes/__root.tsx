import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  Outlet,
  Link,
  createRootRouteWithContext,
  useRouter,
  HeadContent,
  Scripts,
} from "@tanstack/react-router";
import { useEffect, type ReactNode } from "react";

import appCss from "../styles.css?url";
import { reportClientError } from "../lib/error-reporting";
import { Footer } from "../components/Footer";
import { ThemeProvider } from "../components/ThemeProvider";
import { LanguageProvider } from "../components/LanguageProvider";
import { Toaster } from "sonner";

function NotFoundComponent() {
  return (
    <div className="flex min-h-screen flex-col">
      <div className="flex flex-1 items-center justify-center bg-background px-4">
        <div className="max-w-md text-center">
          <p className="eyebrow">404</p>
          <h1 className="mt-4 text-4xl text-foreground">Page not found</h1>
          <p className="mt-3 text-sm text-muted-foreground">
            The page you're looking for doesn't exist or has been moved.
          </p>
          <div className="mt-8">
            <Link to="/" className="btn-primary">
              Return home
            </Link>
          </div>
        </div>
      </div>
      <Footer />
    </div>
  );
}

function ErrorComponent({ error, reset }: { error: Error; reset: () => void }) {
  console.error(error);
  const router = useRouter();
  useEffect(() => {
    reportClientError(error, { boundary: "tanstack_root_error_component" });
  }, [error]);

  return (
    <div className="flex min-h-screen flex-col">
      <div className="flex flex-1 items-center justify-center bg-background px-4">
        <div className="max-w-md text-center">
          <h1 className="text-2xl text-foreground">This page didn't load</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            Something went wrong. Try refreshing or head back home.
          </p>
          <div className="mt-6 flex flex-wrap justify-center gap-3">
            <button
              onClick={() => {
                router.invalidate();
                reset();
              }}
              className="btn-primary"
            >
              Try again
            </button>
            <a href="/" className="btn-ghost-light text-foreground border-border hover:bg-muted">
              Go home
            </a>
          </div>
        </div>
      </div>
      <Footer />
    </div>
  );
}

export const Route = createRootRouteWithContext<{ queryClient: QueryClient }>()({
  head: () => ({
    meta: [
      { charSet: "utf-8" },
      { name: "viewport", content: "width=device-width, initial-scale=1, viewport-fit=cover" },
      { title: "Locus Design — Premium Construction & Design-Build" },
      {
        name: "description",
        content:
          "Locus Design is a premium construction firm delivering residential, commercial, and design-build projects with architectural rigor and engineered precision.",
      },
      { name: "author", content: "Locus Design" },
      // Issued for a Search Console property on the previous domain, so it
      // verifies nothing on locusdesign.online. Replace it with the token from
      // Search Console once the new domain is added there; an unrecognised
      // token is ignored rather than harmful, so it is left in place meanwhile.
      { name: "google-site-verification", content: "krFMEbybP2xmCaY1oNdMHhbWy6xjhzjpzEM7gJs1Hm8" },

      { property: "og:title", content: "Locus Design — Premium Construction & Design-Build" },
      {
        property: "og:description",
        content:
          "Building landmarks, delivering trust. Explore projects, services, and client portal.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
    links: [
      { rel: "stylesheet", href: appCss },
      // SVG first for crisp rendering at any size; the .ico is the fallback for
      // browsers that do not take SVG icons. Both are the "L." monogram from the
      // wordmark — the previous icon was the starter template's.
      { rel: "icon", href: "/favicon.svg", type: "image/svg+xml" },
      { rel: "icon", href: "/favicon.ico", sizes: "256x256" },
      { rel: "apple-touch-icon", href: "/icon.png" },
      // Fonts are self-hosted (public/fonts, declared in src/styles.css).
      // Loading them from Google cost ~1s of render-blocking on simulated
      // mobile: a stylesheet request to one third-party origin, which then
      // pointed at font files on a second. Both are gone, so the faces are
      // same-origin and preloadable, and the CSP no longer has to allow either
      // host. Only the Latin subsets are preloaded — latin-ext loads on demand,
      // and Devanagari was never covered by these families anyway.
      {
        rel: "preload",
        as: "font",
        type: "font/woff2",
        href: "/fonts/fraunces-latin.woff2",
        crossOrigin: "anonymous",
      },
      {
        rel: "preload",
        as: "font",
        type: "font/woff2",
        href: "/fonts/inter-latin.woff2",
        crossOrigin: "anonymous",
      },
    ],
  }),
  shellComponent: RootShell,
  component: RootComponent,
  notFoundComponent: NotFoundComponent,
  errorComponent: ErrorComponent,
});

function RootShell({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <head>
        <HeadContent />
      </head>
      <body>
        {children}
        <Scripts />
      </body>
    </html>
  );
}

function RootComponent() {
  const { queryClient } = Route.useRouteContext();
  return (
    <QueryClientProvider client={queryClient}>
      <ThemeProvider>
        <LanguageProvider>
          <Outlet />
          <Toaster position="top-center" richColors />
        </LanguageProvider>
      </ThemeProvider>
    </QueryClientProvider>
  );
}
