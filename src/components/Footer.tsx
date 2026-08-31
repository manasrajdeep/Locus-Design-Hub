import { LanguageToggle } from "@/components/LanguageProvider";

/**
 * Site footer.
 *
 * Carries the language toggle because it is the one chrome every page renders —
 * the header toggle exists only on the homepage, the portal and the admin
 * layout, which left `/auth` and `/pending` with no way to switch at all. A
 * client arriving at the login page in Hindi had no control to reach for.
 */
export function Footer() {
  return (
    <footer className="border-t border-border bg-background py-8">
      <div className="mx-auto flex max-w-6xl flex-col items-center gap-3 px-6 text-center">
        <LanguageToggle className="border-border !text-foreground hover:bg-muted" />
        <p className="text-xs tracking-wider text-muted-foreground">
          Website made by{" "}
          <a
            href="https://manasrajdeep.in"
            target="_blank"
            rel="noopener noreferrer"
            className="text-foreground hover:text-amber-brand transition-colors"
          >
            manasrajdeep.in
          </a>
        </p>
      </div>
    </footer>
  );
}
