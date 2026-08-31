import { registerImageVariants, type ImageVariantMap } from "@/lib/image-registry";

export interface HomepageStat {
  label: string;
  value: string;
}
export interface HomepageService {
  title: string;
  description: string;
  icon?: string;
}
export interface LabelValue {
  label: string;
  value: string;
}

export interface HomepagePortfolio {
  image_url: string;
  caption?: string;
  /** Case study fields — all optional, sensible copy is generated when blank. */
  typology?: string;
  location?: string;
  year?: string;
  summary?: string;
  highlights?: string[];
  specs?: LabelValue[];
  gallery?: string[];
}

export interface HomepagePrinciple {
  icon?: string;
  title: string;
  formula: string;
  body: string;
}

export interface HomepageProcessStep {
  step: string;
  title: string;
  note: string;
}

export interface HomepageSections {
  nav: { services: string; engineering: string; portfolio: string; contact: string };
  hero: {
    eyebrow: string;
    primary_cta: string;
    secondary_cta: string;
    specs: LabelValue[];
  };
  marquee: string[];
  services_intro: { eyebrow: string; heading: string; body: string };
  engineering: {
    eyebrow: string;
    heading: string;
    body: string;
    principles: HomepagePrinciple[];
    loadpath: { eyebrow: string; heading: string; body: string };
  };
  simulator: { eyebrow: string; heading: string; body: string; enabled: boolean };
  portfolio_intro: { eyebrow: string; heading: string };
  process: { eyebrow: string; heading: string; steps: HomepageProcessStep[] };
  cta: { eyebrow: string; heading: string; body: string; button: string };
  contact: { eyebrow: string; heading: string; body: string; facts: LabelValue[] };
  seo: { title: string; description: string; keywords: string };
}

export const DEFAULT_SECTIONS: HomepageSections = {
  nav: {
    services: "Services",
    engineering: "Engineering",
    portfolio: "Portfolio",
    contact: "Contact",
  },
  hero: {
    eyebrow: "Locus Design · Est. 2007 · IS 456 : 2000",
    primary_cta: "Client Login",
    secondary_cta: "View Work",
    specs: [
      { label: "Design code", value: "IS 456 / IS 875" },
      { label: "Concrete grade", value: "M25 – M50" },
      { label: "Deflection limit", value: "L / 250" },
    ],
  },
  marquee: [
    "load path",
    "moment of inertia",
    "factor of safety 1.5",
    "shear reinforcement",
    "M25 · Fe500",
    "differential settlement",
    "thermal expansion joints",
    "centre of gravity",
    "wind uplift",
    "soil bearing capacity",
  ],
  services_intro: {
    eyebrow: "What we do",
    heading: "Craft at every scale.",
    body: "From single-family homes to multi-tower developments, we bring the same standard of design intent and construction discipline.",
  },
  engineering: {
    eyebrow: "The physics underneath",
    heading: "Architecture is what you see. Statics is why it stays.",
    body: "Behind the finishes sits a resolved system of forces. These are the four principles we refuse to compromise on any site.",
    principles: [
      {
        icon: "anchor",
        title: "Load path discipline",
        formula: "ΣF = 0 · ΣM = 0",
        body: "Every kilonewton has a documented route from slab to soil. Nothing is left to chance, nothing is left in bending it was never designed for.",
      },
      {
        icon: "scale",
        title: "Factor of safety",
        formula: "1.5 DL · 1.5 LL",
        body: "We size sections against the load the building will never see, so the load it does see is felt by nobody inside it.",
      },
      {
        icon: "ruler",
        title: "Stiffness over bulk",
        formula: "I = bh³ / 12",
        body: "Geometry is cheaper than material. Depth, orientation and continuity buy stiffness that extra concrete simply cannot.",
      },
      {
        icon: "waves",
        title: "Movement, allowed for",
        formula: "ΔL = α·L·ΔT",
        body: "Concrete breathes, steel grows, soils creep. Joints, bearings and tolerances are detailed for that motion up front.",
      },
    ],
    loadpath: {
      eyebrow: "Load path, visualised",
      heading: "Compression above, tension below, equilibrium throughout.",
      body: "A truss is the cleanest lesson in structure: the top chord is pushed, the bottom chord is pulled, and the web members simply argue the difference down to the supports. We design every frame with that clarity — if a force cannot be traced, it cannot be trusted.",
    },
  },
  simulator: {
    eyebrow: "Try it yourself",
    heading: "Bend a beam.",
    body: "A live simply-supported RC beam. Move the span, the load, and the section depth and watch serviceability pass or fail in real time — the same check that governs whether your floor feels solid underfoot.",
    enabled: true,
  },
  portfolio_intro: { eyebrow: "Selected work", heading: "Portfolio." },
  process: {
    eyebrow: "Method",
    heading: "From soil report to handover.",
    steps: [
      {
        step: "01",
        title: "Survey & geotechnics",
        note: "Bearing capacity, water table, and site levels set the structural logic.",
      },
      {
        step: "02",
        title: "Analysis & modelling",
        note: "Gravity, wind, and seismic cases resolved before a single line is drawn in detail.",
      },
      {
        step: "03",
        title: "Detailing & tendering",
        note: "Bar bending schedules, joint details, and quantities priced with no ambiguity.",
      },
      {
        step: "04",
        title: "Execution & handover",
        note: "Daily site record, cube tests, snag closure, and a documented as-built set.",
      },
    ],
  },
  cta: {
    eyebrow: "Client experience",
    heading: "Transparency, from foundation to handover.",
    body: "Every Locus Design client gets a private, mobile-first portal — real-time milestones, daily site updates, secured contracts and invoices, and a direct line to their project team.",
    button: "Access Your Portal",
  },
  contact: {
    eyebrow: "Get in touch",
    heading: "Start a conversation.",
    body: "Considering a new build, renovation, or design-build partnership? Send us a message and our team will get back to you within two business days.",
    facts: [
      { label: "Typical response", value: "< 2 business days" },
      { label: "Feasibility review", value: "Complimentary" },
      { label: "Service radius", value: "Pan-India, project dependent" },
    ],
  },
  seo: {
    title: "Locus Design — Premium Construction & Design-Build Firm",
    // Keep under 160 characters: Google truncates past roughly that, and the
    // homepage SEO test asserts it. "Premium" is dropped here only because the
    // title above already carries it.
    description:
      "Locus Design builds residential, commercial and design-build projects — engineered detailing, transparent daily site reporting and a private client portal.",
    keywords:
      "construction company, design-build, residential construction, commercial construction, structural detailing, project management",
  },
};

/** Fill any missing/blank branch of the saved sections JSON from the defaults. */
export function mergeSections(raw: unknown): HomepageSections {
  const src = (raw ?? {}) as Record<string, unknown>;
  const merge = <T>(key: keyof HomepageSections, fallback: T): T => {
    const v = src[key as string];
    if (v === undefined || v === null) return fallback;
    if (Array.isArray(v)) return (v.length ? v : fallback) as T;
    if (typeof v === "object" && !Array.isArray(fallback)) {
      return { ...(fallback as object), ...(v as object) } as T;
    }
    return v as T;
  };
  const d = DEFAULT_SECTIONS;
  const engineering = merge("engineering", d.engineering);
  return {
    nav: merge("nav", d.nav),
    hero: merge("hero", d.hero),
    marquee: merge("marquee", d.marquee),
    services_intro: merge("services_intro", d.services_intro),
    engineering: {
      ...engineering,
      principles: engineering.principles?.length
        ? engineering.principles
        : d.engineering.principles,
      loadpath: { ...d.engineering.loadpath, ...(engineering.loadpath ?? {}) },
    },
    simulator: merge("simulator", d.simulator),
    portfolio_intro: merge("portfolio_intro", d.portfolio_intro),
    process: (() => {
      const p = merge("process", d.process);
      return { ...p, steps: p.steps?.length ? p.steps : d.process.steps };
    })(),
    cta: merge("cta", d.cta),
    contact: (() => {
      const c = merge("contact", d.contact);
      return { ...c, facts: c.facts?.length ? c.facts : d.contact.facts };
    })(),
    seo: merge("seo", d.seo),
  };
}

export interface HomepageContent {
  id: string;
  hero_title: string;
  hero_subtitle: string;
  hero_image_url: string;
  stats: HomepageStat[];
  services: HomepageService[];
  portfolio: HomepagePortfolio[];
  sections: HomepageSections;
  /** Responsive variants for CMS-uploaded images, keyed by public URL. */
  image_variants: ImageVariantMap;
}

// Fetched directly through the public (anon-readable) client so the homepage does
// not depend on a server-function RPC round-trip, which can fail at the edge and
// blank the page.
const BASE_COLUMNS =
  "id, hero_title, hero_subtitle, hero_image_url, stats, services, portfolio, sections";

/** Postgres "undefined column" — the image_variants migration has not run yet. */
const UNDEFINED_COLUMN = "42703";

export async function fetchHomepageContent(): Promise<HomepageContent | null> {
  // Imported here rather than at module scope so the Supabase client — GoTrue,
  // PostgREST and the realtime/websocket engine, ~56 KiB gzipped — stays out of
  // the public homepage's initial bundle. It was being modulepreloaded on a
  // marketing page that renders entirely from server-rendered data, competing
  // with the critical path for bandwidth on mobile.
  const { supabase } = await import("@/integrations/supabase/client");
  const read = (columns: string) =>
    supabase.from("homepage_content").select(columns).limit(1).maybeSingle();

  let { data, error } = await read(`${BASE_COLUMNS}, image_variants`);

  // Deploying the app before applying the migration would otherwise blank the
  // homepage entirely. Fall back to the columns that have always existed; the
  // build-time manifest still covers every image the site shipped with.
  if (error?.code === UNDEFINED_COLUMN) {
    ({ data, error } = await read(BASE_COLUMNS));
  }

  if (error) throw new Error(error.message);
  if (!data) return null;
  const row = data as unknown as HomepageContent & { sections: unknown; image_variants: unknown };
  const image_variants = (row.image_variants ?? {}) as ImageVariantMap;
  // ResponsiveImage resolves through the registry, so publish before rendering.
  registerImageVariants(image_variants);
  return { ...row, sections: mergeSections(row.sections), image_variants };
}
