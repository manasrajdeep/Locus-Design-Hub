import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useSuspenseQuery, queryOptions } from "@tanstack/react-query";
import {
  ArrowRight,
  Building2,
  Hammer,
  Home as HomeIcon,
  PencilRuler,
  LogIn,
  Loader2,
  Send,
  Ruler,
  Scale,
  Waves,
  Anchor,
} from "lucide-react";
import { useEffect, useState } from "react";
import { fetchHomepageContent, mergeSections, type HomepageContent } from "@/lib/homepage";
import { SITE_URL, absoluteUrl } from "@/lib/site";
import { supabase } from "@/integrations/supabase/client";
import { Footer } from "@/components/Footer";
import { ThemeToggle } from "@/components/ThemeProvider";
import { LanguageToggle, useLanguage } from "@/components/LanguageProvider";
import { BeamSimulator } from "@/components/home/BeamSimulator";
import { LoadPath } from "@/components/home/LoadPath";
import { CaseStudyModal, type CaseStudy } from "@/components/home/CaseStudyModal";
import { ResponsiveImage, buildSources } from "@/components/ResponsiveImage";
import { normalizeImageSrc } from "@/lib/image-registry";
import { useReveal, useCountUp } from "@/hooks/useReveal";

import { toast } from "sonner";

const homepageOptions = queryOptions({
  queryKey: ["homepage_content"],
  queryFn: fetchHomepageContent,
  retry: 2,
});

export const Route = createFileRoute("/")({
  loader: ({ context }) => context.queryClient.ensureQueryData(homepageOptions),
  head: ({ loaderData }) => {
    const seo = mergeSections(loaderData?.sections).seo;
    const hero = normalizeImageSrc(loaderData?.hero_image_url ?? "");
    // og:image and JSON-LD need an absolute URL. The hero is usually a
    // root-relative path (`/media/hero.jpg`), which previously failed the
    // `https://` test and dropped the social card image entirely — so resolve
    // relative paths against SITE_URL instead of discarding them. CMS uploads
    // already arrive absolute and pass through untouched.
    const heroAbsolute = hero
      ? hero.startsWith("https://")
        ? hero
        : absoluteUrl(hero)
      : undefined;
    // Preload the LCP hero in its best format so the browser starts fetching it
    // before React hydrates. AVIF first, WebP as the Safari-friendly fallback.
    // Pass the CMS manifest explicitly rather than relying on the module-level
    // registry: head() runs during SSR, where being order-independent matters.
    const heroSources = buildSources(hero, loaderData?.image_variants);
    const heroPreload = heroSources.map((s) => ({
      rel: "preload",
      as: "image",
      type: s.type,
      imageSrcSet: s.srcSet,
      imageSizes: "100vw",
      fetchPriority: "high" as const,
    }));
    return {
      meta: [
        { title: seo.title },
        { name: "description", content: seo.description },
        { name: "keywords", content: seo.keywords },
        { name: "robots", content: "index, follow, max-image-preview:large" },
        { property: "og:title", content: seo.title },
        { property: "og:description", content: seo.description },
        { property: "og:type", content: "website" },
        { property: "og:url", content: `${SITE_URL}/` },
        { property: "og:site_name", content: "Locus Design" },
        { property: "og:locale", content: "en_IN" },
        { name: "twitter:card", content: "summary_large_image" },
        { name: "twitter:title", content: seo.title },
        { name: "twitter:description", content: seo.description },
        ...(heroAbsolute
          ? [
              { property: "og:image", content: heroAbsolute },
              { property: "og:image:alt", content: "Locus Design construction project" },
              { name: "twitter:image", content: heroAbsolute },
            ]
          : []),
      ],
      links: [{ rel: "canonical", href: `${SITE_URL}/` }, ...heroPreload.slice(0, 1)],
      scripts: [
        {
          type: "application/ld+json",
          children: JSON.stringify({
            "@context": "https://schema.org",
            "@type": "GeneralContractor",
            name: "Locus Design",
            description: seo.description,
            url: `${SITE_URL}/`,
            ...(heroAbsolute ? { image: heroAbsolute } : {}),
            areaServed: "IN",
            serviceType: (loaderData?.services ?? []).map((s) => s.title).filter(Boolean),
          }),
        },
        {
          type: "application/ld+json",
          children: JSON.stringify({
            "@context": "https://schema.org",
            "@type": "WebSite",
            name: "Locus Design",
            url: `${SITE_URL}/`,
          }),
        },
      ],
    };
  },

  component: HomePage,
});

const iconMap: Record<string, React.ComponentType<{ className?: string }>> = {
  home: HomeIcon,
  building: Building2,
  hammer: Hammer,
  "pencil-ruler": PencilRuler,
};

const principleIconMap: Record<string, React.ComponentType<{ className?: string }>> = {
  anchor: Anchor,
  scale: Scale,
  ruler: Ruler,
  waves: Waves,
};

function useSession() {
  const [signedIn, setSignedIn] = useState<boolean | null>(null);
  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setSignedIn(!!data.session));
    const { data: sub } = supabase.auth.onAuthStateChange((_e, session) => setSignedIn(!!session));
    return () => sub.subscription.unsubscribe();
  }, []);
  return signedIn;
}

function HomePage() {
  const { data } = useSuspenseQuery(homepageOptions);
  const navigate = useNavigate();
  const signedIn = useSession();
  const [scrollY, setScrollY] = useState(0);
  const [study, setStudy] = useState<CaseStudy | null>(null);
  const { t } = useLanguage();

  useEffect(() => {
    const onScroll = () => setScrollY(window.scrollY);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  if (!data) return null;
  const content = data as HomepageContent;
  const s = content.sections;

  return (
    <div className="flex min-h-screen flex-col bg-background">
      {/* NAV */}
      <header
        className={`fixed top-0 left-0 right-0 z-30 transition-colors duration-300 ${
          scrollY > 80 ? "border-b border-white/10 bg-ink/85 backdrop-blur-md" : ""
        }`}
      >
        <div className="mx-auto flex max-w-7xl items-center justify-between gap-2 px-4 py-5 sm:px-6 sm:py-6">
          <Link to="/" className="font-display text-xl tracking-tight text-white">
            Locus<span className="text-amber-brand">.</span>Design
          </Link>
          <nav className="hidden items-center gap-8 text-sm text-white/80 md:flex">
            <a href="#services" className="transition hover:text-white">
              {s.nav.services}
            </a>
            <a href="#engineering" className="transition hover:text-white">
              {s.nav.engineering}
            </a>
            <a href="#portfolio" className="transition hover:text-white">
              {s.nav.portfolio}
            </a>
            <a href="#contact" className="transition hover:text-white">
              {s.nav.contact}
            </a>
          </nav>
          <div className="flex shrink-0 items-center gap-1.5 sm:gap-3">
            <ThemeToggle />
            <LanguageToggle />
            <button
              onClick={() => navigate({ to: signedIn ? "/portal" : "/auth" })}
              className="btn-primary px-3 text-xs sm:px-5"
            >
              <LogIn className="h-4 w-4" />
              <span className="whitespace-nowrap">
                {signedIn ? t("openPortal") : t("clientLogin")}
              </span>
            </button>
          </div>
        </div>
      </header>

      <main className="flex-1">
        {/* HERO */}
        <section className="relative flex min-h-[96vh] items-center overflow-hidden">
          <ResponsiveImage
            src={content.hero_image_url}
            alt="Locus Design premium construction project — concrete and steel structure at golden hour"
            sizes="100vw"
            className="absolute inset-0 h-full w-full object-cover will-change-transform"
            style={{ transform: `translate3d(0, ${scrollY * 0.18}px, 0) scale(1.08)` }}
            loading="eager"
            fetchPriority="high"
            decoding="sync"
          />

          <div className="hero-overlay" />
          <div className="blueprint-grid-light absolute inset-0 opacity-70" aria-hidden="true" />

          {/* plumb bob — gravity as ornament */}
          <div
            className="pointer-events-none absolute right-10 top-0 hidden lg:block"
            aria-hidden="true"
          >
            <div className="plumb-line flex flex-col items-center">
              <div className="h-40 w-px bg-white/35" />
              <div className="h-3 w-3 rotate-45 bg-amber-brand" />
            </div>
          </div>

          <div className="relative z-10 mx-auto w-full max-w-7xl px-6 py-32 text-white">
            <div className="flex items-center gap-4">
              <span className="h-px w-14 bg-amber-brand" />
              <p className="rule-label text-white/70">{s.hero.eyebrow}</p>
            </div>
            <h1 className="mt-7 max-w-4xl text-5xl leading-[1.02] text-white sm:text-6xl lg:text-[5.25rem]">
              {content.hero_title}
            </h1>
            <p className="mt-7 max-w-xl text-lg leading-relaxed text-white/85">
              {content.hero_subtitle}
            </p>
            <div className="mt-10 flex flex-wrap gap-4">
              <button
                onClick={() => navigate({ to: signedIn ? "/portal" : "/auth" })}
                className="btn-primary"
              >
                <LogIn className="h-4 w-4" />
                {s.hero.primary_cta}
              </button>
              <a href="#portfolio" className="btn-ghost-light">
                {s.hero.secondary_cta} <ArrowRight className="h-4 w-4" />
              </a>
            </div>

            <dl className="mt-16 grid max-w-2xl grid-cols-2 gap-x-8 gap-y-4 border-t border-white/15 pt-6 sm:grid-cols-3">
              {s.hero.specs.map((spec) => (
                <div key={spec.label}>
                  <dt className="rule-label text-white/50">{spec.label}</dt>
                  <dd className="mt-1 font-mono text-sm text-white/90">{spec.value}</dd>
                </div>
              ))}
            </dl>
          </div>
        </section>

        {/* MARQUEE */}
        <div className="overflow-hidden border-y border-border bg-ink py-4" aria-hidden="true">
          <div className="marquee-track gap-10">
            {[...s.marquee, ...s.marquee].map((term, i) => (
              <span key={i} className="rule-label whitespace-nowrap text-white/45">
                {term} <span className="text-amber-brand">/</span>
              </span>
            ))}
          </div>
        </div>

        {/* STATS */}
        <section aria-label="Company metrics" className="border-b border-border bg-background">
          <div className="mx-auto grid max-w-7xl grid-cols-2 divide-border md:grid-cols-4 md:divide-x">
            {content.stats.map((s, i) => (
              <StatCell key={i} value={s.value} label={s.label} />
            ))}
          </div>
        </section>

        {/* SERVICES */}
        <section id="services" className="py-24 md:py-32">
          <div className="mx-auto max-w-7xl px-6">
            <Reveal className="max-w-2xl">
              <p className="eyebrow">{s.services_intro.eyebrow}</p>
              <h2 className="mt-3 text-4xl text-foreground md:text-5xl">
                {s.services_intro.heading}
              </h2>
              <p className="mt-4 text-muted-foreground">{s.services_intro.body}</p>
            </Reveal>
            <div className="mt-14 grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-4">
              {content.services.map((svc, i) => {
                const Icon = iconMap[svc.icon ?? ""] ?? Building2;
                return (
                  <Reveal key={i} delay={i * 90}>
                    <article className="group relative h-full overflow-hidden rounded-md border border-border bg-card p-8 transition-all duration-500 hover:-translate-y-1.5 hover:border-amber-brand hover:shadow-[0_24px_60px_-32px_color-mix(in_oklab,var(--foreground)_45%,transparent)]">
                      <span className="rule-label absolute right-6 top-6 text-muted-foreground/60">
                        {String(i + 1).padStart(2, "0")}
                      </span>
                      <Icon className="h-8 w-8 text-amber-brand" />
                      <h3 className="mt-6 text-xl text-foreground">{svc.title}</h3>
                      <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
                        {svc.description}
                      </p>
                      <span className="mt-6 block h-px w-0 bg-amber-brand transition-all duration-500 group-hover:w-full" />
                    </article>
                  </Reveal>
                );
              })}
            </div>
          </div>
        </section>

        {/* ENGINEERING / PHYSICS */}
        <section id="engineering" className="border-y border-border bg-concrete py-24 md:py-32">
          <div className="mx-auto max-w-7xl px-6">
            <Reveal className="max-w-3xl">
              <p className="eyebrow">{s.engineering.eyebrow}</p>
              <h2 className="mt-3 text-4xl text-foreground md:text-5xl">{s.engineering.heading}</h2>
              <p className="mt-5 text-muted-foreground">{s.engineering.body}</p>
            </Reveal>

            <div className="mt-14 grid gap-6 md:grid-cols-2 lg:grid-cols-4">
              {s.engineering.principles.map((p, i) => {
                const Icon = principleIconMap[p.icon ?? ""] ?? Anchor;
                return (
                  <Reveal key={`${p.title}-${i}`} delay={i * 90}>
                    <article className="h-full rounded-md border border-border bg-card p-7">
                      <Icon className="h-7 w-7 text-amber-brand" />
                      <h3 className="mt-5 text-lg text-foreground">{p.title}</h3>
                      <p className="mt-2 font-mono text-xs text-amber-brand">{p.formula}</p>
                      <p className="mt-3 text-sm leading-relaxed text-muted-foreground">{p.body}</p>
                    </article>
                  </Reveal>
                );
              })}
            </div>

            <Reveal className="mt-16">
              <div className="grid gap-8 lg:grid-cols-[1.4fr_1fr] lg:items-center">
                <LoadPath />
                <div>
                  <p className="eyebrow">{s.engineering.loadpath.eyebrow}</p>
                  <h3 className="mt-3 text-2xl text-foreground md:text-3xl">
                    {s.engineering.loadpath.heading}
                  </h3>
                  <p className="mt-4 text-sm leading-relaxed text-muted-foreground">
                    {s.engineering.loadpath.body}
                  </p>
                </div>
              </div>
            </Reveal>
          </div>
        </section>

        {/* INTERACTIVE BEAM */}
        {s.simulator.enabled && (
          <section className="py-24 md:py-32">
            <div className="mx-auto max-w-7xl px-6">
              <Reveal className="max-w-2xl">
                <p className="eyebrow">{s.simulator.eyebrow}</p>
                <h2 className="mt-3 text-4xl text-foreground md:text-5xl">{s.simulator.heading}</h2>
                <p className="mt-4 text-muted-foreground">{s.simulator.body}</p>
              </Reveal>
              <div className="mt-14">
                <BeamSimulator />
              </div>
            </div>
          </section>
        )}

        {/* PORTFOLIO */}
        <section id="portfolio" className="border-y border-border bg-concrete py-24 md:py-32">
          <div className="mx-auto max-w-7xl px-6">
            <Reveal className="flex flex-wrap items-end justify-between gap-6">
              <div className="max-w-2xl">
                <p className="eyebrow">{s.portfolio_intro.eyebrow}</p>
                <h2 className="mt-3 text-4xl text-foreground md:text-5xl">
                  {s.portfolio_intro.heading}
                </h2>
              </div>
              <p className="rule-label">{content.portfolio.length} documented builds</p>
            </Reveal>
            <div className="mt-14 grid grid-cols-1 gap-4 sm:grid-cols-2 md:gap-6 lg:grid-cols-3">
              {content.portfolio.map((p, i) => (
                <Reveal
                  key={i}
                  delay={(i % 3) * 110}
                  className={i % 5 === 0 ? "sm:col-span-2 lg:col-span-2" : undefined}
                >
                  <button
                    type="button"
                    onClick={() =>
                      setStudy({
                        index: i,
                        item: p,
                        gallery: content.portfolio
                          .filter((_, j) => j !== i)
                          .map((q) => q.image_url),
                      })
                    }
                    aria-label={`Open case study: ${p.caption ?? `project ${i + 1}`}`}
                    className="block w-full text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-brand focus-visible:ring-offset-2 focus-visible:ring-offset-background"
                  >
                    <figure
                      className={`group relative overflow-hidden rounded-md bg-muted ${
                        i % 5 === 0 ? "aspect-[16/10]" : "aspect-[4/5]"
                      }`}
                    >
                      <ResponsiveImage
                        src={p.image_url}
                        alt={p.caption ?? "Locus Design construction project"}
                        sizes={
                          i % 5 === 0
                            ? "(max-width: 640px) 100vw, (max-width: 1024px) 100vw, 760px"
                            : "(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 380px"
                        }
                        className="h-full w-full object-cover transition-transform duration-[900ms] ease-out group-hover:scale-[1.07]"
                      />

                      <div className="pointer-events-none absolute inset-0 opacity-0 transition-opacity duration-500 group-hover:opacity-100">
                        <div className="blueprint-grid-light absolute inset-0" />
                      </div>
                      <figcaption className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/80 via-black/25 to-transparent p-5 text-sm font-medium text-white">
                        <span className="rule-label text-white/60">
                          {String(i + 1).padStart(2, "0")}
                        </span>
                        <div className="mt-1">{p.caption ?? "Locus Design project"}</div>
                        <span className="mt-2 inline-flex items-center gap-1.5 text-xs text-amber-brand opacity-0 transition-opacity duration-300 group-hover:opacity-100">
                          View case study <ArrowRight className="h-3.5 w-3.5" />
                        </span>
                      </figcaption>
                    </figure>
                  </button>
                </Reveal>
              ))}
            </div>
            <CaseStudyModal study={study} onClose={() => setStudy(null)} />
          </div>
        </section>

        {/* PROCESS */}
        <section className="py-24 md:py-32">
          <div className="mx-auto max-w-7xl px-6">
            <Reveal className="max-w-2xl">
              <p className="eyebrow">{s.process.eyebrow}</p>
              <h2 className="mt-3 text-4xl text-foreground md:text-5xl">{s.process.heading}</h2>
            </Reveal>
            <ol className="mt-14 grid gap-px overflow-hidden rounded-lg border border-border bg-border md:grid-cols-4">
              {s.process.steps.map((st, i) => (
                <li key={`${st.step}-${i}`} className="bg-card p-8">
                  <span className="font-display text-3xl text-amber-brand">{st.step}</span>
                  <h3 className="mt-4 text-lg text-foreground">{st.title}</h3>
                  <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{st.note}</p>
                  <span className="mt-6 block h-px bg-border" aria-hidden="true" />
                  <span className="rule-label mt-3 block">
                    stage {i + 1} of {s.process.steps.length}
                  </span>
                </li>
              ))}
            </ol>
          </div>
        </section>

        {/* ABOUT / CTA */}
        <section
          id="about"
          className="relative overflow-hidden border-y border-border bg-ink py-24 md:py-32"
        >
          <div className="blueprint-grid-light absolute inset-0" aria-hidden="true" />
          <div className="relative mx-auto max-w-4xl px-6 text-center">
            <p className="eyebrow text-white/60">{s.cta.eyebrow}</p>
            <h2 className="mt-3 text-4xl text-white md:text-5xl">{s.cta.heading}</h2>
            <p className="mt-6 text-lg leading-relaxed text-white/75">{s.cta.body}</p>
            <div className="mt-10">
              <button
                onClick={() => navigate({ to: signedIn ? "/portal" : "/auth" })}
                className="btn-primary"
              >
                <LogIn className="h-4 w-4" />
                {s.cta.button}
              </button>
            </div>
          </div>
        </section>

        {/* CONTACT */}
        <section id="contact" className="bg-concrete py-24 md:py-32">
          <div className="mx-auto grid max-w-6xl gap-12 px-6 md:grid-cols-2">
            <div>
              <p className="eyebrow">{s.contact.eyebrow}</p>
              <h2 className="mt-3 text-4xl text-foreground md:text-5xl">{s.contact.heading}</h2>
              <p className="mt-6 leading-relaxed text-muted-foreground">{s.contact.body}</p>
              <dl className="mt-10 space-y-4 border-t border-border pt-6">
                {s.contact.facts.map((f) => (
                  <div key={f.label} className="flex items-baseline justify-between gap-6">
                    <dt className="rule-label">{f.label}</dt>
                    <dd className="font-mono text-sm text-foreground">{f.value}</dd>
                  </div>
                ))}
              </dl>
            </div>
            <ContactForm />
          </div>
        </section>
      </main>

      <Footer />
    </div>
  );
}

function StatCell({ value, label }: { value: string; label: string }) {
  const { ref, text } = useCountUp(value);
  return (
    <div ref={ref} className="px-6 py-12 text-center">
      <div className="font-display text-4xl text-foreground md:text-5xl">{text}</div>
      <div className="mt-2 text-xs uppercase tracking-wider text-muted-foreground">{label}</div>
    </div>
  );
}

function Reveal({
  children,
  className,
  delay = 0,
}: {
  children: React.ReactNode;
  className?: string;
  delay?: number;
}) {
  const { ref, shown } = useReveal<HTMLDivElement>();
  return (
    <div
      ref={ref}
      style={{ transitionDelay: `${delay}ms` }}
      className={`${shown ? "reveal-up reveal-in" : "reveal-up"} ${className ?? ""}`}
    >
      {children}
    </div>
  );
}

function ContactForm() {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [message, setMessage] = useState("");
  const [sending, setSending] = useState(false);

  /**
   * Submitting is inert until React has hydrated.
   *
   * The page is server-rendered, so the markup exists well before `onSubmit` is
   * attached. A click (or Enter) in that window performs a *native* submission:
   * the browser navigates to `/?name=…&email=…&message=…`, the enquiry is never
   * written, and the visitor's name, email and message end up in the URL, in
   * their history, and in the Referer header sent to third parties.
   *
   * Disabling the submit button closes both routes in, because HTML implicit
   * submission is also suppressed when the default button is disabled.
   */
  const [hydrated, setHydrated] = useState(false);
  useEffect(() => setHydrated(true), []);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    const n = name.trim(),
      em = email.trim(),
      m = message.trim();
    if (n.length < 1 || n.length > 100) return toast.error("Please enter your name.");
    if (em.length < 3 || em.length > 255 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(em))
      return toast.error("Please enter a valid email.");
    if (m.length < 1 || m.length > 2000)
      return toast.error("Message is required (max 2000 characters).");
    setSending(true);
    const { error } = await supabase
      .from("contact_messages")
      .insert({ name: n, email: em, message: m });
    setSending(false);
    if (error) {
      // The database throttles submissions per address; surface that as a human
      // sentence rather than the raw trigger exception.
      if (error.message.includes("contact_rate_limit_exceeded")) {
        return toast.error("Too many messages just now.", {
          description: "Please try again in a little while, or email us directly.",
        });
      }
      return toast.error(error.message);
    }
    toast.success("Message sent. We'll be in touch shortly.");
    setName("");
    setEmail("");
    setMessage("");
  };

  return (
    <form
      onSubmit={submit}
      className="space-y-4 rounded-lg border border-border bg-card p-6 md:p-8"
    >
      <div>
        <label htmlFor="contact-name" className="text-xs font-medium tracking-wide text-foreground">
          Name
        </label>
        <input
          id="contact-name"
          name="name"
          autoComplete="name"
          placeholder="Your full name"
          required
          maxLength={100}
          value={name}
          onChange={(e) => setName(e.target.value)}
          className="mt-1 w-full rounded-md border border-input bg-background px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
        />
      </div>
      <div>
        <label
          htmlFor="contact-email"
          className="text-xs font-medium tracking-wide text-foreground"
        >
          Email
        </label>
        <input
          id="contact-email"
          name="email"
          autoComplete="email"
          placeholder="you@example.com"
          required
          type="email"
          maxLength={255}
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          className="mt-1 w-full rounded-md border border-input bg-background px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
        />
      </div>
      <div>
        <label
          htmlFor="contact-message"
          className="text-xs font-medium tracking-wide text-foreground"
        >
          Message
        </label>
        <textarea
          id="contact-message"
          name="message"
          placeholder="Tell us about your site, scope and timeline."
          required
          rows={5}
          maxLength={2000}
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          className="mt-1 w-full resize-y rounded-md border border-input bg-background px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
        />
      </div>
      <button
        type="submit"
        disabled={!hydrated || sending}
        aria-busy={!hydrated || sending}
        className="btn-primary w-full disabled:cursor-not-allowed disabled:opacity-60"
      >
        {sending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
        Send message
      </button>
    </form>
  );
}
