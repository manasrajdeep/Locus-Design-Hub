import { ResponsiveImage } from "@/components/ResponsiveImage";
import { Building2, Hammer, Home, PencilRuler } from "lucide-react";

export type PreviewStat = { label: string; value: string };
export type PreviewService = { title: string; description: string; icon?: string };
export type PreviewPortfolio = { image_url: string; caption?: string };

export interface HomepagePreviewProps {
  heroTitle: string;
  heroSubtitle: string;
  heroImageUrl: string;
  stats: PreviewStat[];
  services: PreviewService[];
  portfolio: PreviewPortfolio[];
  dirty?: boolean;
}

const icons: Record<string, typeof Home> = {
  home: Home,
  building: Building2,
  hammer: Hammer,
  "pencil-ruler": PencilRuler,
};

export function HomepagePreview({
  heroTitle,
  heroSubtitle,
  heroImageUrl,
  stats,
  services,
  portfolio,
  dirty,
}: HomepagePreviewProps) {
  return (
    <div className="overflow-hidden rounded-lg border border-border bg-background">
      <div className="flex items-center justify-between gap-3 border-b border-border bg-muted/50 px-3 py-2">
        <div className="flex items-center gap-1.5">
          <span className="h-2.5 w-2.5 rounded-full bg-muted-foreground/30" />
          <span className="h-2.5 w-2.5 rounded-full bg-muted-foreground/30" />
          <span className="h-2.5 w-2.5 rounded-full bg-muted-foreground/30" />
        </div>
        <p className="text-[11px] uppercase tracking-wider text-muted-foreground">
          Live preview {dirty ? "· unsaved changes" : "· in sync"}
        </p>
      </div>

      <div className="max-h-[70vh] overflow-y-auto">
        {/* Hero */}
        <section className="relative aspect-video w-full overflow-hidden bg-muted">
          {heroImageUrl && (
            <img
              src={heroImageUrl}
              alt=""
              className="absolute inset-0 h-full w-full object-cover"
            />
          )}
          <div className="hero-overlay absolute inset-0" />
          <div className="relative flex h-full flex-col justify-end p-4 md:p-6">
            <h2 className="font-display text-xl leading-tight text-white md:text-3xl">
              {heroTitle || "Hero title"}
            </h2>
            <p className="mt-2 max-w-md text-xs text-white/80 md:text-sm">
              {heroSubtitle || "Hero subtitle"}
            </p>
            <span className="mt-3 w-fit rounded-md bg-amber-brand px-3 py-1.5 text-xs font-medium text-background">
              Client Login
            </span>
          </div>
        </section>

        {/* Stats */}
        {stats.length > 0 && (
          <section className="grid grid-cols-2 gap-px border-y border-border bg-border sm:grid-cols-4">
            {stats.map((s, i) => (
              <div key={i} className="bg-background px-3 py-4 text-center">
                <p className="font-display text-xl text-foreground">{s.value || "—"}</p>
                <p className="mt-1 text-[11px] uppercase tracking-wide text-muted-foreground">
                  {s.label || "Label"}
                </p>
              </div>
            ))}
          </section>
        )}

        {/* Services */}
        {services.length > 0 && (
          <section className="space-y-3 px-4 py-6">
            <p className="eyebrow">Services</p>
            <div className="grid gap-3 sm:grid-cols-2">
              {services.map((s, i) => {
                const Icon = icons[s.icon ?? "building"] ?? Building2;
                return (
                  <div key={i} className="rounded-md border border-border p-3">
                    <Icon className="h-4 w-4 text-amber-brand" />
                    <p className="mt-2 text-sm font-medium text-foreground">
                      {s.title || "Service title"}
                    </p>
                    <p className="mt-1 text-xs text-muted-foreground">{s.description}</p>
                  </div>
                );
              })}
            </div>
          </section>
        )}

        {/* Portfolio */}
        {portfolio.length > 0 && (
          <section className="space-y-3 border-t border-border px-4 py-6">
            <p className="eyebrow">Portfolio</p>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
              {portfolio.map((p, i) => (
                <figure key={i} className="space-y-1">
                  <div className="aspect-[4/5] overflow-hidden rounded-md bg-muted">
                    {p.image_url && (
                      <ResponsiveImage
                        src={p.image_url}
                        alt=""
                        sizes="200px"
                        className="h-full w-full object-cover"
                      />
                    )}
                  </div>
                  {p.caption && (
                    <figcaption className="truncate text-[11px] text-muted-foreground">
                      {p.caption}
                    </figcaption>
                  )}
                </figure>
              ))}
            </div>
          </section>
        )}
      </div>
    </div>
  );
}
