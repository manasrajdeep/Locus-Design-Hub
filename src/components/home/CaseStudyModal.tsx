import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import type { HomepagePortfolio } from "@/lib/homepage";
import { ResponsiveImage } from "@/components/ResponsiveImage";
import { useState, useEffect, useRef } from "react";

export interface CaseStudy {
  index: number;
  item: HomepagePortfolio;
  gallery: string[];
}

const TYPOLOGIES = [
  "Residential — RCC framed",
  "Commercial — composite steel",
  "Mixed-use — shear-wall core",
  "Institutional — flat-slab",
  "Industrial — long-span portal",
];

const SPECS = [
  {
    label: "Structural system",
    pool: [
      "RCC moment frame",
      "Composite steel deck",
      "Post-tensioned slab",
      "Load-bearing masonry + RCC bands",
    ],
  },
  {
    label: "Foundation",
    pool: [
      "Isolated footings on medium SBC strata",
      "Raft, 900 mm thick",
      "Bored cast-in-situ piles, 600 mm ⌀",
      "Combined strip footings",
    ],
  },
  { label: "Concrete grade", pool: ["M25", "M30", "M35", "M40"] },
  { label: "Steel", pool: ["Fe500D", "Fe550D", "Fe500 + Fe415 stirrups", "Fe500D, epoxy-coated"] },
  {
    label: "Seismic zone",
    pool: ["Zone III (Z = 0.16)", "Zone IV (Z = 0.24)", "Zone II (Z = 0.10)", "Zone V (Z = 0.36)"],
  },
  {
    label: "Design code basis",
    pool: [
      "IS 456 / IS 1893 / IS 875",
      "IS 800 / IS 1893",
      "IS 456 / IS 13920",
      "IS 456 / IS 875 Pt.3",
    ],
  },
];

const HIGHLIGHTS = [
  "Load path resolved from slab → beam → column → footing with no eccentric transfer, keeping column moments within 12% of design capacity.",
  "Deflection controlled to span/360 under service load using δ = 5wL⁴/384EI, verified on site after de-propping.",
  "Cantilever balconies designed as fixed-end members; counter-weight back-span reinforcement extended 1.5× the projection.",
  "Lateral drift limited to h/500 by tuning shear-wall stiffness rather than adding column mass — 9% saving in concrete volume.",
  "Wind pressure from IS 875 Pt.3 checked against façade fixings; anchors specified at 2.2× factored pull-out.",
  "Concrete cured under wet-burlap for 14 days; 28-day cube strengths averaged 6% above characteristic grade.",
  "Waterproofing detailed as a continuous membrane with 300 mm upstands; no cold joint left unsealed below plinth.",
  "Sequenced pours to keep construction joints away from maximum-shear regions near supports.",
];

function pick<T>(pool: T[], seed: number, salt: number): T {
  return pool[(seed * 7 + salt * 3) % pool.length]!;
}

export function CaseStudyModal({
  study,
  onClose,
}: {
  study: CaseStudy | null;
  onClose: () => void;
}) {
  const [active, setActive] = useState(0);
  const scrollRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    setActive(0);
    // Radix moves focus into the dialog on open, which can scroll the panel past
    // the intro copy on short viewports — always start at the top.
    const id = requestAnimationFrame(() => scrollRef.current?.scrollTo({ top: 0 }));
    return () => cancelAnimationFrame(id);
  }, [study?.index]);

  if (!study) return null;
  const { index, item, gallery } = study;
  const title = item.caption ?? `Locus Design project ${index + 1}`;
  const typology =
    [item.typology, item.location, item.year].filter(Boolean).join(" · ") ||
    TYPOLOGIES[index % TYPOLOGIES.length]!;
  const summary =
    item.summary?.trim() ||
    "Designed and delivered end-to-end by Locus Design — from soil investigation and structural analysis through execution, quality control and handover. Every element below was checked against limit-state design before a single pour was approved.";
  const highlights = item.highlights?.filter((h) => h.trim()).length
    ? item.highlights.filter((h) => h.trim())
    : [0, 1, 2, 3].map((k) => HIGHLIGHTS[(index * 3 + k) % HIGHLIGHTS.length]!);
  const specs = item.specs?.filter((sp) => sp.label?.trim()).length
    ? item.specs.filter((sp) => sp.label?.trim())
    : SPECS.map((sp, i) => ({ label: sp.label, value: pick(sp.pool, index + 1, i) }));
  const extraGallery = (item.gallery ?? []).filter((g) => g.trim());
  const images = [item.image_url, ...extraGallery, ...gallery.filter((g) => g !== item.image_url)]
    .filter((g, i, arr) => g && arr.indexOf(g) === i)
    .slice(0, 6);

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="flex max-h-[90dvh] w-[calc(100vw-1.5rem)] max-w-5xl flex-col overflow-hidden overscroll-contain p-0 sm:w-[calc(100vw-4rem)]">
        <div className="relative aspect-[4/3] max-h-[26dvh] w-full shrink-0 overflow-hidden bg-muted sm:aspect-[16/9] sm:max-h-[34dvh]">
          <ResponsiveImage
            src={images[active] ?? item.image_url}
            alt={title}
            sizes="(max-width: 1024px) 100vw, 1024px"
            className="h-full w-full object-cover"
          />
          <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-transparent to-transparent" />
          <span className="rule-label absolute left-4 top-4 text-white/70 sm:left-6 sm:top-5">
            case study {String(index + 1).padStart(2, "0")}
          </span>
        </div>

        {images.length > 1 && (
          <div className="flex shrink-0 gap-2 overflow-x-auto px-4 pt-4 sm:px-6">
            {images.map((src, i) => (
              <button
                key={src + i}
                type="button"
                onClick={() => setActive(i)}
                aria-label={`View supporting image ${i + 1}`}
                aria-current={i === active}
                className={`aspect-[4/3] h-12 w-18 shrink-0 overflow-hidden rounded border transition sm:h-16 sm:w-24 ${
                  i === active ? "border-amber-brand" : "border-border opacity-70 hover:opacity-100"
                }`}
              >
                <ResponsiveImage
                  src={src}
                  alt=""
                  sizes="96px"
                  className="h-full w-full object-cover"
                />
              </button>
            ))}
          </div>
        )}

        <div
          ref={scrollRef}
          className="grid min-h-0 flex-1 gap-8 overflow-y-auto overscroll-contain p-5 sm:p-6 md:grid-cols-[1.3fr_1fr] md:gap-10 md:p-8"
        >
          <div>
            <DialogHeader className="space-y-3 text-left">
              <p className="eyebrow">{typology}</p>
              <DialogTitle className="text-2xl leading-tight text-foreground sm:text-3xl md:text-4xl">
                {title}
              </DialogTitle>
              <DialogDescription className="whitespace-pre-line text-sm leading-relaxed sm:text-base">
                {summary}
              </DialogDescription>
            </DialogHeader>

            <h3 className="rule-label mt-8">Civil &amp; engineering highlights</h3>
            <ul className="mt-4 space-y-4">
              {highlights.map((h, i) => (
                <li key={i} className="flex gap-3 text-sm leading-relaxed text-muted-foreground">
                  <span className="font-display text-amber-brand">
                    {String(i + 1).padStart(2, "0")}
                  </span>
                  <span>{h}</span>
                </li>
              ))}
            </ul>
          </div>

          <aside className="rounded-lg border border-border bg-muted/40 p-6">
            <h3 className="rule-label">Technical schedule</h3>
            <dl className="mt-5 space-y-4">
              {specs.map((sp, i) => (
                <div
                  key={`${sp.label}-${i}`}
                  className="border-b border-border pb-3 last:border-0 last:pb-0"
                >
                  <dt className="rule-label">{sp.label}</dt>
                  <dd className="mt-1 text-sm text-foreground">{sp.value}</dd>
                </div>
              ))}
            </dl>
          </aside>
        </div>
      </DialogContent>
    </Dialog>
  );
}
