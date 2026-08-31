import { createFileRoute, Link } from "@tanstack/react-router";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import {
  ArrowLeft,
  CloudUpload,
  Eye,
  EyeOff,
  History,
  ImagePlus,
  Loader2,
  Plus,
  RotateCcw,
  Trash2,
} from "lucide-react";
import { HomepagePreview } from "@/components/admin/HomepagePreview";
import { submitSitemapFn } from "@/lib/search-submit.functions";
import type { HomepagePortfolio, HomepageSections } from "@/lib/homepage";
import {
  fetchEditorState,
  fetchVersions,
  publishDraft,
  saveDraft,
  type HomepageDraft,
  type HomepageVersion,
} from "@/lib/homepage-cms";
import { formatBytes, uploadHomepageImage, type AspectName } from "@/lib/homepage-media";
import type { ImageEntry } from "@/lib/image-variants";
import { registerImageVariants } from "@/lib/image-registry";

export const Route = createFileRoute("/_authenticated/admin/homepage")({
  head: () => ({
    meta: [{ title: "Content Management — Locus Design" }, { name: "robots", content: "noindex" }],
  }),
  component: ContentEditor,
});

type Content = HomepageDraft;

const TABS = [
  "Hero",
  "Stats",
  "Services",
  "Portfolio",
  "Engineering",
  "Process",
  "Contact & CTA",
  "Navigation & SEO",
  "History",
] as const;
type Tab = (typeof TABS)[number];

type DraftStatus = "idle" | "saving" | "saved" | "error";

function ContentEditor() {
  const [id, setId] = useState<string | null>(null);
  const [c, setC] = useState<Content | null>(null);
  /** Serialised copy of what is currently live — drives the Publish button. */
  const [publishedJson, setPublishedJson] = useState<string | null>(null);
  const [publishedAt, setPublishedAt] = useState<string | null>(null);
  const [draftSavedAt, setDraftSavedAt] = useState<string | null>(null);
  const [draftStatus, setDraftStatus] = useState<DraftStatus>("idle");
  const [publishing, setPublishing] = useState(false);
  const [showPreview, setShowPreview] = useState(true);
  const [tab, setTab] = useState<Tab>("Hero");
  const [versions, setVersions] = useState<HomepageVersion[] | null>(null);
  /** Draft JSON already persisted, so autosave never re-writes the same payload. */
  const persistedDraft = useRef<string | null>(null);

  const loadVersions = useCallback(() => {
    fetchVersions()
      .then(setVersions)
      .catch((e) => {
        setVersions([]);
        toast.error(e instanceof Error ? e.message : "Could not load version history");
      });
  }, []);

  useEffect(() => {
    fetchEditorState()
      .then((state) => {
        if (!state) return;
        setId(state.id);
        setC(state.draft);
        setPublishedJson(JSON.stringify(state.published));
        setPublishedAt(state.published_at);
        setDraftSavedAt(state.draft_updated_at);
        persistedDraft.current = JSON.stringify(state.draft);
      })
      .catch((e) => toast.error(e instanceof Error ? e.message : "Could not load the homepage"));
    loadVersions();
  }, [loadVersions]);

  const draftJson = useMemo(() => (c ? JSON.stringify(c) : null), [c]);

  // The live preview renders through ResponsiveImage, which resolves variants
  // from the registry. Publish the draft's manifest so an image uploaded a
  // moment ago previews with its real widths instead of falling back to none.
  useEffect(() => {
    if (c) registerImageVariants(c.image_variants);
  }, [c]);

  // Debounced draft autosave — nothing here touches the live homepage.
  useEffect(() => {
    if (!id || !draftJson || draftJson === persistedDraft.current) return;
    setDraftStatus("saving");
    const handle = setTimeout(() => {
      const payload = JSON.parse(draftJson) as HomepageDraft;
      saveDraft(id, payload)
        .then((at) => {
          persistedDraft.current = draftJson;
          setDraftSavedAt(at);
          setDraftStatus("saved");
        })
        .catch((e) => {
          setDraftStatus("error");
          toast.error(e instanceof Error ? e.message : "Draft could not be saved");
        });
    }, 1000);
    return () => clearTimeout(handle);
  }, [draftJson, id]);

  // Guard against closing the tab while an autosave is still pending.
  useEffect(() => {
    const onBeforeUnload = (e: BeforeUnloadEvent) => {
      if (draftJson && draftJson !== persistedDraft.current) e.preventDefault();
    };
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => window.removeEventListener("beforeunload", onBeforeUnload);
  }, [draftJson]);

  const unpublished = !!draftJson && !!publishedJson && draftJson !== publishedJson;

  if (!c || !id)
    return (
      <div className="flex justify-center py-24">
        <Loader2 className="h-6 w-6 animate-spin" />
      </div>
    );

  const setSections = (patch: Partial<HomepageSections>) =>
    setC({ ...c, sections: { ...c.sections, ...patch } });

  /**
   * Records a chosen image: the URL patch and the responsive manifest the
   * upload generated, in one update. Two separate setC calls would each build
   * from the same stale `c` and the second would drop the first.
   * `variants` is undefined when the URL was typed in by hand rather than
   * uploaded — that image simply has no generated widths.
   */
  const applyImage = (
    url: string,
    variants: ImageEntry | undefined,
    patch: (draft: Content, url: string) => Content,
  ) =>
    setC(
      patch(
        {
          ...c,
          image_variants: variants ? { ...c.image_variants, [url]: variants } : c.image_variants,
        },
        url,
      ),
    );

  const publish = async (draft: Content = c, note = "Published") => {
    setPublishing(true);
    try {
      const at = await publishDraft(id, draft, note);
      setC(draft);
      persistedDraft.current = JSON.stringify(draft);
      setPublishedJson(JSON.stringify(draft));
      setPublishedAt(at);
      setDraftSavedAt(at);
      setDraftStatus("saved");
      loadVersions();
      toast.success("Homepage published — it is live now");

      try {
        const outcomes = await submitSitemapFn({ data: {} });
        const ok = outcomes.filter((o) => o.status === "ok").map((o) => o.engine);
        if (ok.length > 0) toast.success(`Sitemap re-submitted to ${ok.join(" and ")}`);
        const problem = outcomes.find((o) => o.status === "failed");
        if (problem) toast.error(problem.detail);
      } catch {
        toast.error("Published, but search engines could not be notified.");
      }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Publish failed");
    } finally {
      setPublishing(false);
    }
  };

  const discardDraft = () => {
    if (!publishedJson) return;
    setC(JSON.parse(publishedJson) as Content);
    toast.success("Draft reset to the live homepage");
  };

  const statusLine = () => {
    if (draftStatus === "saving") return "Saving draft…";
    if (draftStatus === "error") return "Draft could not be saved — check your connection.";
    if (unpublished)
      return `Draft saved${draftSavedAt ? ` ${timeAgo(draftSavedAt)}` : ""} — not published yet.`;
    return `Everything published${publishedAt ? ` · live since ${formatWhen(publishedAt)}` : ""}.`;
  };

  const s = c.sections;

  const restore = (version: HomepageVersion, andPublish: boolean) => {
    setC(version.content);
    setTab("Hero");
    if (andPublish)
      void publish(version.content, `Rolled back to ${formatWhen(version.created_at)}`);
    else toast.success("Version loaded into the draft — press Publish to make it live");
  };

  return (
    <div className="mx-auto max-w-7xl space-y-8 px-4 py-8 md:px-6">
      <div>
        <Link
          to="/admin/dashboard"
          className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="h-4 w-4" /> Back
        </Link>
        <div className="mt-4 flex flex-wrap items-baseline justify-between gap-4">
          <div>
            <p className="eyebrow">Content Management</p>
            <h1 className="mt-2 text-3xl text-foreground md:text-4xl">Public homepage</h1>
            <p className="mt-2 flex items-center gap-2 text-sm text-muted-foreground">
              {draftStatus === "saving" && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
              <span data-testid="draft-status">{statusLine()}</span>
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <button
              onClick={() => setShowPreview((v) => !v)}
              className="inline-flex items-center gap-2 rounded-md border border-border px-3 py-2 text-sm text-foreground hover:bg-muted"
            >
              {showPreview ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              {showPreview ? "Hide preview" : "Show preview"}
            </button>
            <button
              onClick={discardDraft}
              disabled={!unpublished || publishing}
              className="inline-flex items-center gap-2 rounded-md border border-border px-3 py-2 text-sm text-foreground hover:bg-muted disabled:opacity-50"
            >
              <RotateCcw className="h-4 w-4" /> Discard draft
            </button>
            <button
              onClick={() => publish()}
              disabled={publishing || !unpublished}
              className="btn-primary"
              data-testid="publish"
            >
              {publishing ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <CloudUpload className="h-4 w-4" />
              )}
              Publish
            </button>
          </div>
        </div>
      </div>

      <div className="flex flex-wrap gap-2 border-b border-border pb-3">
        {TABS.map((tb) => (
          <button
            key={tb}
            onClick={() => setTab(tb)}
            className={`rounded-md px-3 py-1.5 text-sm transition ${
              tab === tb
                ? "bg-amber-brand text-background"
                : "text-muted-foreground hover:bg-muted hover:text-foreground"
            }`}
          >
            {tb}
          </button>
        ))}
      </div>

      <div className={showPreview ? "grid gap-8 lg:grid-cols-2 lg:items-start" : ""}>
        <div className="space-y-10">
          {tab === "Hero" && (
            <Section title="Hero">
              <Field label="Eyebrow line">
                <input
                  value={s.hero.eyebrow}
                  onChange={(e) => setSections({ hero: { ...s.hero, eyebrow: e.target.value } })}
                  className={inputCls}
                />
              </Field>
              <Field label="Hero title">
                <input
                  value={c.hero_title}
                  onChange={(e) => setC({ ...c, hero_title: e.target.value })}
                  className={inputCls}
                />
              </Field>
              <Field label="Hero subtitle">
                <textarea
                  rows={3}
                  value={c.hero_subtitle}
                  onChange={(e) => setC({ ...c, hero_subtitle: e.target.value })}
                  className={inputCls}
                />
              </Field>
              <div className="grid gap-3 sm:grid-cols-2">
                <Field label="Primary button">
                  <input
                    value={s.hero.primary_cta}
                    onChange={(e) =>
                      setSections({ hero: { ...s.hero, primary_cta: e.target.value } })
                    }
                    className={inputCls}
                  />
                </Field>
                <Field label="Secondary button">
                  <input
                    value={s.hero.secondary_cta}
                    onChange={(e) =>
                      setSections({ hero: { ...s.hero, secondary_cta: e.target.value } })
                    }
                    className={inputCls}
                  />
                </Field>
              </div>

              <Field label="Hero image">
                <ImageField
                  value={c.hero_image_url}
                  aspect="hero"
                  previewClass="aspect-video"
                  onChange={(url, v) => applyImage(url, v, (d, u) => ({ ...d, hero_image_url: u }))}
                />
              </Field>

              <PairList
                title="Hero spec strip"
                items={s.hero.specs}
                labelPlaceholder="Label (e.g. Design code)"
                valuePlaceholder="Value (e.g. IS 456)"
                onChange={(specs) => setSections({ hero: { ...s.hero, specs } })}
                addLabel="Add spec"
              />

              <Field label="Scrolling marquee terms (one per line)">
                <textarea
                  rows={5}
                  value={s.marquee.join("\n")}
                  onChange={(e) =>
                    setSections({ marquee: e.target.value.split("\n").map((v) => v.trimStart()) })
                  }
                  className={inputCls}
                />
              </Field>
            </Section>
          )}

          {tab === "Stats" && (
            <Section title="Stats band">
              {c.stats.map((st, i) => (
                <div key={i} className="grid grid-cols-[1fr_1fr_auto] items-start gap-2">
                  <input
                    placeholder="Label"
                    value={st.label}
                    onChange={(e) => {
                      const next = [...c.stats];
                      next[i] = { ...next[i]!, label: e.target.value };
                      setC({ ...c, stats: next });
                    }}
                    className={inputCls}
                  />
                  <input
                    placeholder="Value"
                    value={st.value}
                    onChange={(e) => {
                      const next = [...c.stats];
                      next[i] = { ...next[i]!, value: e.target.value };
                      setC({ ...c, stats: next });
                    }}
                    className={inputCls}
                  />
                  <RemoveBtn
                    onClick={() => setC({ ...c, stats: c.stats.filter((_, x) => x !== i) })}
                  />
                </div>
              ))}
              <AddBtn
                label="Add stat"
                onClick={() => setC({ ...c, stats: [...c.stats, { label: "", value: "" }] })}
              />
            </Section>
          )}

          {tab === "Services" && (
            <>
              <Section title="Services intro">
                <IntroFields
                  value={s.services_intro}
                  onChange={(services_intro) => setSections({ services_intro })}
                />
              </Section>
              <Section title="Service cards">
                {c.services.map((sv, i) => (
                  <div key={i} className="space-y-2 rounded-md border border-border p-4">
                    <div className="flex items-center justify-between">
                      <p className="text-xs font-medium text-muted-foreground">Service {i + 1}</p>
                      <RemoveBtn
                        onClick={() =>
                          setC({ ...c, services: c.services.filter((_, x) => x !== i) })
                        }
                      />
                    </div>
                    <input
                      placeholder="Title"
                      value={sv.title}
                      onChange={(e) => {
                        const next = [...c.services];
                        next[i] = { ...next[i]!, title: e.target.value };
                        setC({ ...c, services: next });
                      }}
                      className={inputCls}
                    />
                    <textarea
                      placeholder="Description"
                      rows={2}
                      value={sv.description}
                      onChange={(e) => {
                        const next = [...c.services];
                        next[i] = { ...next[i]!, description: e.target.value };
                        setC({ ...c, services: next });
                      }}
                      className={inputCls}
                    />
                    <select
                      value={sv.icon ?? "building"}
                      onChange={(e) => {
                        const next = [...c.services];
                        next[i] = { ...next[i]!, icon: e.target.value };
                        setC({ ...c, services: next });
                      }}
                      className={inputCls}
                    >
                      <option value="home">Home</option>
                      <option value="building">Building</option>
                      <option value="hammer">Hammer</option>
                      <option value="pencil-ruler">Pencil-Ruler</option>
                    </select>
                  </div>
                ))}
                <AddBtn
                  label="Add service"
                  onClick={() =>
                    setC({
                      ...c,
                      services: [...c.services, { title: "", description: "", icon: "building" }],
                    })
                  }
                />
              </Section>
            </>
          )}

          {tab === "Portfolio" && (
            <>
              <Section title="Portfolio intro">
                <div className="grid gap-3 sm:grid-cols-2">
                  <Field label="Eyebrow">
                    <input
                      value={s.portfolio_intro.eyebrow}
                      onChange={(e) =>
                        setSections({
                          portfolio_intro: { ...s.portfolio_intro, eyebrow: e.target.value },
                        })
                      }
                      className={inputCls}
                    />
                  </Field>
                  <Field label="Heading">
                    <input
                      value={s.portfolio_intro.heading}
                      onChange={(e) =>
                        setSections({
                          portfolio_intro: { ...s.portfolio_intro, heading: e.target.value },
                        })
                      }
                      className={inputCls}
                    />
                  </Field>
                </div>
              </Section>
              <Section title="Projects & case studies">
                {c.portfolio.map((p, i) => (
                  <PortfolioEditor
                    key={i}
                    index={i}
                    item={p}
                    onChange={(item) => {
                      const next = [...c.portfolio];
                      next[i] = item;
                      setC({ ...c, portfolio: next });
                    }}
                    onImageChange={(url, v) =>
                      applyImage(url, v, (d, u) => ({
                        ...d,
                        portfolio: d.portfolio.map((p2, x) =>
                          x === i ? { ...p2, image_url: u } : p2,
                        ),
                      }))
                    }
                    onGalleryAdd={(url, v) =>
                      applyImage(url, v, (d, u) => ({
                        ...d,
                        portfolio: d.portfolio.map((p2, x) =>
                          x === i ? { ...p2, gallery: [...(p2.gallery ?? []), u] } : p2,
                        ),
                      }))
                    }
                    onRemove={() =>
                      setC({ ...c, portfolio: c.portfolio.filter((_, x) => x !== i) })
                    }
                  />
                ))}
                <AddBtn
                  label="Add project"
                  onClick={() =>
                    setC({ ...c, portfolio: [...c.portfolio, { image_url: "", caption: "" }] })
                  }
                />
              </Section>
            </>
          )}

          {tab === "Engineering" && (
            <>
              <Section title="Engineering intro">
                <IntroFields
                  value={s.engineering}
                  onChange={(v) => setSections({ engineering: { ...s.engineering, ...v } })}
                />
              </Section>
              <Section title="Principles">
                {s.engineering.principles.map((p, i) => (
                  <div key={i} className="space-y-2 rounded-md border border-border p-4">
                    <div className="flex items-center justify-between">
                      <p className="text-xs font-medium text-muted-foreground">Principle {i + 1}</p>
                      <RemoveBtn
                        onClick={() =>
                          setSections({
                            engineering: {
                              ...s.engineering,
                              principles: s.engineering.principles.filter((_, x) => x !== i),
                            },
                          })
                        }
                      />
                    </div>
                    <select
                      value={p.icon ?? "anchor"}
                      onChange={(e) => {
                        const next = [...s.engineering.principles];
                        next[i] = { ...next[i]!, icon: e.target.value };
                        setSections({ engineering: { ...s.engineering, principles: next } });
                      }}
                      className={inputCls}
                    >
                      <option value="anchor">Anchor</option>
                      <option value="scale">Scale</option>
                      <option value="ruler">Ruler</option>
                      <option value="waves">Waves</option>
                    </select>
                    <input
                      placeholder="Title"
                      value={p.title}
                      onChange={(e) => {
                        const next = [...s.engineering.principles];
                        next[i] = { ...next[i]!, title: e.target.value };
                        setSections({ engineering: { ...s.engineering, principles: next } });
                      }}
                      className={inputCls}
                    />
                    <input
                      placeholder="Formula"
                      value={p.formula}
                      onChange={(e) => {
                        const next = [...s.engineering.principles];
                        next[i] = { ...next[i]!, formula: e.target.value };
                        setSections({ engineering: { ...s.engineering, principles: next } });
                      }}
                      className={inputCls}
                    />
                    <textarea
                      placeholder="Body"
                      rows={3}
                      value={p.body}
                      onChange={(e) => {
                        const next = [...s.engineering.principles];
                        next[i] = { ...next[i]!, body: e.target.value };
                        setSections({ engineering: { ...s.engineering, principles: next } });
                      }}
                      className={inputCls}
                    />
                  </div>
                ))}
                <AddBtn
                  label="Add principle"
                  onClick={() =>
                    setSections({
                      engineering: {
                        ...s.engineering,
                        principles: [
                          ...s.engineering.principles,
                          { icon: "anchor", title: "", formula: "", body: "" },
                        ],
                      },
                    })
                  }
                />
              </Section>
              <Section title="Load path panel">
                <IntroFields
                  value={s.engineering.loadpath}
                  onChange={(v) =>
                    setSections({
                      engineering: {
                        ...s.engineering,
                        loadpath: { ...s.engineering.loadpath, ...v },
                      },
                    })
                  }
                />
              </Section>
              <Section title="Beam simulator">
                <label className="flex items-center gap-2 text-sm text-foreground">
                  <input
                    type="checkbox"
                    checked={s.simulator.enabled}
                    onChange={(e) =>
                      setSections({ simulator: { ...s.simulator, enabled: e.target.checked } })
                    }
                  />
                  Show the interactive beam section
                </label>
                <IntroFields
                  value={s.simulator}
                  onChange={(v) => setSections({ simulator: { ...s.simulator, ...v } })}
                />
              </Section>
            </>
          )}

          {tab === "Process" && (
            <Section title="Process">
              <div className="grid gap-3 sm:grid-cols-2">
                <Field label="Eyebrow">
                  <input
                    value={s.process.eyebrow}
                    onChange={(e) =>
                      setSections({ process: { ...s.process, eyebrow: e.target.value } })
                    }
                    className={inputCls}
                  />
                </Field>
                <Field label="Heading">
                  <input
                    value={s.process.heading}
                    onChange={(e) =>
                      setSections({ process: { ...s.process, heading: e.target.value } })
                    }
                    className={inputCls}
                  />
                </Field>
              </div>
              {s.process.steps.map((st, i) => (
                <div key={i} className="space-y-2 rounded-md border border-border p-4">
                  <div className="flex items-center justify-between">
                    <p className="text-xs font-medium text-muted-foreground">Step {i + 1}</p>
                    <RemoveBtn
                      onClick={() =>
                        setSections({
                          process: {
                            ...s.process,
                            steps: s.process.steps.filter((_, x) => x !== i),
                          },
                        })
                      }
                    />
                  </div>
                  <div className="grid gap-2 sm:grid-cols-[90px_1fr]">
                    <input
                      placeholder="01"
                      value={st.step}
                      onChange={(e) => {
                        const next = [...s.process.steps];
                        next[i] = { ...next[i]!, step: e.target.value };
                        setSections({ process: { ...s.process, steps: next } });
                      }}
                      className={inputCls}
                    />
                    <input
                      placeholder="Title"
                      value={st.title}
                      onChange={(e) => {
                        const next = [...s.process.steps];
                        next[i] = { ...next[i]!, title: e.target.value };
                        setSections({ process: { ...s.process, steps: next } });
                      }}
                      className={inputCls}
                    />
                  </div>
                  <textarea
                    placeholder="Note"
                    rows={2}
                    value={st.note}
                    onChange={(e) => {
                      const next = [...s.process.steps];
                      next[i] = { ...next[i]!, note: e.target.value };
                      setSections({ process: { ...s.process, steps: next } });
                    }}
                    className={inputCls}
                  />
                </div>
              ))}
              <AddBtn
                label="Add step"
                onClick={() =>
                  setSections({
                    process: {
                      ...s.process,
                      steps: [...s.process.steps, { step: "", title: "", note: "" }],
                    },
                  })
                }
              />
            </Section>
          )}

          {tab === "Contact & CTA" && (
            <>
              <Section title="Portal CTA band">
                <IntroFields
                  value={s.cta}
                  onChange={(v) => setSections({ cta: { ...s.cta, ...v } })}
                />
                <Field label="Button label">
                  <input
                    value={s.cta.button}
                    onChange={(e) => setSections({ cta: { ...s.cta, button: e.target.value } })}
                    className={inputCls}
                  />
                </Field>
              </Section>
              <Section title="Contact">
                <IntroFields
                  value={s.contact}
                  onChange={(v) => setSections({ contact: { ...s.contact, ...v } })}
                />
                <PairList
                  title="Contact facts"
                  items={s.contact.facts}
                  labelPlaceholder="Label"
                  valuePlaceholder="Value"
                  onChange={(facts) => setSections({ contact: { ...s.contact, facts } })}
                  addLabel="Add fact"
                />
              </Section>
            </>
          )}

          {tab === "Navigation & SEO" && (
            <>
              <Section title="Navigation labels">
                <div className="grid gap-3 sm:grid-cols-2">
                  {(["services", "engineering", "portfolio", "contact"] as const).map((k) => (
                    <Field key={k} label={k[0]!.toUpperCase() + k.slice(1)}>
                      <input
                        value={s.nav[k]}
                        onChange={(e) => setSections({ nav: { ...s.nav, [k]: e.target.value } })}
                        className={inputCls}
                      />
                    </Field>
                  ))}
                </div>
              </Section>
              <Section title="Search engine metadata">
                <Field label="Page title">
                  <input
                    value={s.seo.title}
                    onChange={(e) => setSections({ seo: { ...s.seo, title: e.target.value } })}
                    className={inputCls}
                  />
                  <CharCount value={s.seo.title} limit={60} />
                </Field>
                <Field label="Meta description">
                  <textarea
                    rows={3}
                    value={s.seo.description}
                    onChange={(e) =>
                      setSections({ seo: { ...s.seo, description: e.target.value } })
                    }
                    className={inputCls}
                  />
                  <CharCount value={s.seo.description} limit={160} />
                </Field>
                <Field label="Keywords (comma separated)">
                  <input
                    value={s.seo.keywords}
                    onChange={(e) => setSections({ seo: { ...s.seo, keywords: e.target.value } })}
                    className={inputCls}
                  />
                </Field>
              </Section>
            </>
          )}

          {tab === "History" && (
            <Section title="Version history">
              <p className="text-sm text-muted-foreground">
                Every publish is snapshotted. Load a snapshot back into the draft to review it, or
                roll straight back if the live page needs fixing now.
              </p>
              {versions === null && <Loader2 className="h-5 w-5 animate-spin" />}
              {versions?.length === 0 && (
                <p className="text-sm text-muted-foreground">
                  No versions yet — publish once to start the history.
                </p>
              )}
              <ul className="space-y-3">
                {versions?.map((v, i) => (
                  <li
                    key={v.id}
                    className="flex flex-wrap items-center justify-between gap-3 rounded-md border border-border p-3"
                  >
                    <div>
                      <p className="flex items-center gap-2 text-sm text-foreground">
                        <History className="h-4 w-4 text-muted-foreground" />
                        {formatWhen(v.created_at)}
                        {i === 0 && (
                          <span className="rounded bg-muted px-1.5 py-0.5 text-[11px] text-muted-foreground">
                            latest
                          </span>
                        )}
                      </p>
                      <p className="mt-1 text-xs text-muted-foreground">
                        {v.note} · {v.content.hero_title || "Untitled hero"}
                      </p>
                    </div>
                    <div className="flex gap-2">
                      <button
                        onClick={() => restore(v, false)}
                        className="rounded-md border border-border px-3 py-1.5 text-sm text-foreground hover:bg-muted"
                      >
                        Load into draft
                      </button>
                      <button
                        onClick={() => restore(v, true)}
                        disabled={publishing}
                        className="rounded-md border border-border px-3 py-1.5 text-sm text-foreground hover:bg-muted disabled:opacity-50"
                      >
                        Roll back &amp; publish
                      </button>
                    </div>
                  </li>
                ))}
              </ul>
            </Section>
          )}

          <div className="flex justify-end">
            <button
              onClick={() => publish()}
              disabled={publishing || !unpublished}
              className="btn-primary"
            >
              {publishing ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <CloudUpload className="h-4 w-4" />
              )}
              Publish changes
            </button>
          </div>
        </div>

        {showPreview && (
          <div className="lg:sticky lg:top-6">
            <HomepagePreview
              heroTitle={c.hero_title}
              heroSubtitle={c.hero_subtitle}
              heroImageUrl={c.hero_image_url}
              stats={c.stats}
              services={c.services}
              portfolio={c.portfolio}
              dirty={unpublished}
            />
          </div>
        )}
      </div>
    </div>
  );
}

/* ---------------- portfolio item ---------------- */

function PortfolioEditor({
  index,
  item,
  onChange,
  onImageChange,
  onGalleryAdd,
  onRemove,
}: {
  index: number;
  item: HomepagePortfolio;
  onChange: (item: HomepagePortfolio) => void;
  /** Cover image: carries the upload's responsive manifest with the URL. */
  onImageChange: (url: string, variants?: ImageEntry) => void;
  /** Gallery append: same, for the case-study gallery. */
  onGalleryAdd: (url: string, variants?: ImageEntry) => void;
  onRemove: () => void;
}) {
  const [open, setOpen] = useState(false);
  const highlights = item.highlights ?? [];
  const specs = item.specs ?? [];
  const gallery = item.gallery ?? [];

  return (
    <div className="space-y-3 rounded-md border border-border p-4">
      <div className="flex items-start justify-between gap-3">
        <p className="text-xs font-medium text-muted-foreground">Project {index + 1}</p>
        <RemoveBtn onClick={onRemove} />
      </div>

      <div className="grid gap-3 sm:grid-cols-[140px_1fr]">
        <ImageField
          value={item.image_url}
          aspect="portrait"
          previewClass="aspect-[4/5]"
          compact
          onChange={onImageChange}
        />
        <div className="space-y-2">
          <input
            placeholder="Project name / caption"
            value={item.caption ?? ""}
            onChange={(e) => onChange({ ...item, caption: e.target.value })}
            className={inputCls}
          />
          <div className="grid gap-2 sm:grid-cols-3">
            <input
              placeholder="Typology"
              value={item.typology ?? ""}
              onChange={(e) => onChange({ ...item, typology: e.target.value })}
              className={inputCls}
            />
            <input
              placeholder="Location"
              value={item.location ?? ""}
              onChange={(e) => onChange({ ...item, location: e.target.value })}
              className={inputCls}
            />
            <input
              placeholder="Year"
              value={item.year ?? ""}
              onChange={(e) => onChange({ ...item, year: e.target.value })}
              className={inputCls}
            />
          </div>
          <button
            type="button"
            onClick={() => setOpen((v) => !v)}
            className="text-sm text-amber-brand hover:underline"
          >
            {open ? "Hide case study" : "Edit case study"}
          </button>
        </div>
      </div>

      {open && (
        <div className="space-y-4 border-t border-border pt-4">
          <Field label="Case study summary">
            <textarea
              rows={4}
              value={item.summary ?? ""}
              onChange={(e) => onChange({ ...item, summary: e.target.value })}
              className={inputCls}
              placeholder="What the project was, the brief, and how it was delivered."
            />
          </Field>

          <Field label="Engineering highlights (one per line)">
            <textarea
              rows={5}
              value={highlights.join("\n")}
              onChange={(e) => onChange({ ...item, highlights: e.target.value.split("\n") })}
              className={inputCls}
            />
          </Field>

          <PairList
            title="Technical schedule"
            items={specs}
            labelPlaceholder="Label (e.g. Concrete grade)"
            valuePlaceholder="Value (e.g. M30)"
            onChange={(v) => onChange({ ...item, specs: v })}
            addLabel="Add row"
          />

          <div className="space-y-2">
            <p className="text-xs font-medium tracking-wide text-foreground">Gallery images</p>
            <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
              {gallery.map((g, gi) => (
                <div key={gi} className="space-y-1">
                  <div className="aspect-[4/5] overflow-hidden rounded-md bg-muted">
                    {g && <img src={g} alt="" className="h-full w-full object-cover" />}
                  </div>
                  <button
                    type="button"
                    onClick={() =>
                      onChange({ ...item, gallery: gallery.filter((_, x) => x !== gi) })
                    }
                    className="text-xs text-muted-foreground hover:text-destructive"
                  >
                    Remove
                  </button>
                </div>
              ))}
              <UploadTile aspect="portrait" onUploaded={onGalleryAdd} />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

/* ---------------- image controls ---------------- */

function useUpload(aspect: AspectName, onUploaded: (url: string, variants: ImageEntry) => void) {
  const [busy, setBusy] = useState(false);
  const inputRef = useRef<HTMLInputElement | null>(null);

  const handle = async (file: File | undefined) => {
    if (!file) return;
    setBusy(true);
    try {
      const res = await uploadHomepageImage(file, aspect);
      onUploaded(res.url, res.variants);
      toast.success(
        `Image ready — cropped to fit and compressed ${formatBytes(res.before)} → ${formatBytes(res.after)}`,
      );
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Upload failed");
    } finally {
      setBusy(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  };

  return { busy, inputRef, handle };
}

/**
 * Character count for a length-capped SEO field.
 *
 * This used to be muted grey whatever the length, which is how a 163-character
 * meta description shipped: the counter said "163 — aim for under 160" and read
 * exactly like every other hint on the page. Over the limit it now turns
 * destructive, because search engines truncate past it.
 */
function CharCount({ value, limit }: { value: string; limit: number }) {
  const over = value.length >= limit;
  return (
    <p
      className={`mt-1 text-xs ${over ? "font-medium text-destructive" : "text-muted-foreground"}`}
    >
      {value.length} characters —{" "}
      {over ? `over the ${limit} limit, this will be truncated.` : `aim for under ${limit}.`}
    </p>
  );
}

function ImageField({
  value,
  aspect,
  previewClass,
  compact,
  onChange,
}: {
  value: string;
  aspect: AspectName;
  previewClass: string;
  compact?: boolean;
  onChange: (url: string, variants?: ImageEntry) => void;
}) {
  const { busy, inputRef, handle } = useUpload(aspect, onChange);
  return (
    <div className="space-y-2">
      <div className={`overflow-hidden rounded-md bg-muted ${previewClass}`}>
        {value && <img src={value} alt="" className="h-full w-full object-cover" />}
      </div>
      <button
        type="button"
        onClick={() => inputRef.current?.click()}
        disabled={busy}
        className="inline-flex w-full items-center justify-center gap-2 rounded-md border border-border px-3 py-2 text-xs text-foreground hover:bg-muted disabled:opacity-60"
      >
        {busy ? (
          <Loader2 className="h-3.5 w-3.5 animate-spin" />
        ) : (
          <ImagePlus className="h-3.5 w-3.5" />
        )}
        {busy ? "Processing…" : "Upload image"}
      </button>
      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={(e) => handle(e.target.files?.[0])}
      />
      {!compact && (
        <input
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder="…or paste an image URL"
          className={inputCls}
        />
      )}
    </div>
  );
}

function UploadTile({
  aspect,
  onUploaded,
}: {
  aspect: AspectName;
  onUploaded: (url: string, variants: ImageEntry) => void;
}) {
  const { busy, inputRef, handle } = useUpload(aspect, onUploaded);
  return (
    <>
      <button
        type="button"
        onClick={() => inputRef.current?.click()}
        disabled={busy}
        className="flex aspect-[4/5] items-center justify-center rounded-md border border-dashed border-border text-muted-foreground hover:border-amber-brand hover:text-foreground"
      >
        {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
      </button>
      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={(e) => handle(e.target.files?.[0])}
      />
    </>
  );
}

/* ---------------- small shared pieces ---------------- */

function IntroFields({
  value,
  onChange,
}: {
  value: { eyebrow: string; heading: string; body: string };
  onChange: (v: { eyebrow: string; heading: string; body: string }) => void;
}) {
  return (
    <>
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Eyebrow">
          <input
            value={value.eyebrow}
            onChange={(e) => onChange({ ...value, eyebrow: e.target.value })}
            className={inputCls}
          />
        </Field>
        <Field label="Heading">
          <input
            value={value.heading}
            onChange={(e) => onChange({ ...value, heading: e.target.value })}
            className={inputCls}
          />
        </Field>
      </div>
      <Field label="Body">
        <textarea
          rows={3}
          value={value.body}
          onChange={(e) => onChange({ ...value, body: e.target.value })}
          className={inputCls}
        />
      </Field>
    </>
  );
}

function PairList({
  title,
  items,
  labelPlaceholder,
  valuePlaceholder,
  onChange,
  addLabel,
}: {
  title: string;
  items: { label: string; value: string }[];
  labelPlaceholder: string;
  valuePlaceholder: string;
  onChange: (items: { label: string; value: string }[]) => void;
  addLabel: string;
}) {
  return (
    <div className="space-y-2">
      <p className="text-xs font-medium tracking-wide text-foreground">{title}</p>
      {items.map((it, i) => (
        <div key={i} className="grid grid-cols-[1fr_1fr_auto] items-start gap-2">
          <input
            placeholder={labelPlaceholder}
            value={it.label}
            onChange={(e) => {
              const next = [...items];
              next[i] = { ...next[i]!, label: e.target.value };
              onChange(next);
            }}
            className={inputCls}
          />
          <input
            placeholder={valuePlaceholder}
            value={it.value}
            onChange={(e) => {
              const next = [...items];
              next[i] = { ...next[i]!, value: e.target.value };
              onChange(next);
            }}
            className={inputCls}
          />
          <RemoveBtn onClick={() => onChange(items.filter((_, x) => x !== i))} />
        </div>
      ))}
      <AddBtn label={addLabel} onClick={() => onChange([...items, { label: "", value: "" }])} />
    </div>
  );
}

function RemoveBtn({ onClick }: { onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className="p-2 text-muted-foreground hover:text-destructive"
      type="button"
    >
      <Trash2 className="h-4 w-4" />
    </button>
  );
}

function AddBtn({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="inline-flex items-center gap-2 text-sm text-amber-brand hover:underline"
    >
      <Plus className="h-4 w-4" /> {label}
    </button>
  );
}

function formatWhen(iso: string) {
  return new Date(iso).toLocaleString(undefined, {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function timeAgo(iso: string) {
  const seconds = Math.round((Date.now() - new Date(iso).getTime()) / 1000);
  if (seconds < 60) return "just now";
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours} h ago`;
  return `on ${formatWhen(iso)}`;
}

const inputCls =
  "w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring";

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="space-y-4">
      <h2 className="text-xl text-foreground">{title}</h2>
      <div className="space-y-3">{children}</div>
    </section>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="text-xs font-medium tracking-wide text-foreground">{label}</label>
      <div className="mt-1">{children}</div>
    </div>
  );
}
