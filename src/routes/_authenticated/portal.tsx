import { createFileRoute, redirect, Link } from "@tanstack/react-router";
import { useEffect, useState, useRef, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import {
  Loader2,
  FileText,
  Download,
  Send,
  MessageCircle,
  Camera,
  ListChecks,
  MapPin,
  LogOut,
  CheckCircle2,
  Circle,
  Clock,
  ChevronDown,
  History,
  RefreshCw,
} from "lucide-react";
import { toast } from "sonner";
import { ThemeToggleSolid } from "@/components/ThemeProvider";
import { LanguageToggle } from "@/components/LanguageProvider";
import {
  formatDate,
  formatDateTime,
  formatTime,
  formatDocKind,
  useLangTick,
} from "@/lib/i18n-format";

import {
  relativeTime,
  absoluteTime,
  SECTION_LABELS,
  type SectionKey,
} from "@/lib/section-timestamps";
import { runWithRetry } from "@/lib/portal-retry";
import { RetryBanner } from "@/components/portal/RetryBanner";

export const Route = createFileRoute("/_authenticated/portal")({
  head: () => ({
    meta: [{ title: "Client Portal — Locus Design" }, { name: "robots", content: "noindex" }],
  }),
  beforeLoad: async ({ context }) => {
    const { data: project } = await supabase
      .from("projects")
      .select("id")
      .eq("customer_id", context.user.id)
      .limit(1)
      .maybeSingle();
    if (!project) throw redirect({ to: "/pending" });
  },
  component: Portal,
});

type Milestone = {
  name: string;
  status: "pending" | "in_progress" | "done";
  updated_at?: string;
  detail?: string;
  checklist?: string[];
};
type Project = {
  id: string;
  name: string;
  address: string | null;
  current_milestone: number;
  milestones: Milestone[];
  customer_id: string;
};
type Update = { id: string; image_url: string; caption: string | null; created_at: string };
type Doc = { id: string; name: string; file_path: string; kind: string; created_at: string };
type Message = {
  id: string;
  project_id: string;
  sender_id: string;
  body: string;
  created_at: string;
};

type Tab = "milestones" | "timeline" | "documents" | "chat";

function Portal() {
  useLangTick();
  const { user } = Route.useRouteContext();
  const [project, setProject] = useState<Project | null>(null);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<Tab>("milestones");
  // Newest change per section for the real project (photos, docs, chat, stages).
  const [liveStamps, setLiveStamps] = useState<Record<SectionKey, string | null>>({
    milestones: null,
    timeline: null,
    documents: null,
    chat: null,
    details: null,
  });

  // Reads the newest row per section so the "last updated" strip reflects real data.
  const loadLiveStamps = useCallback(async (projectId: string) => {
    const latest = async (
      table: "project_updates" | "project_documents" | "messages" | "project_activity",
    ) => {
      const { data } = await supabase
        .from(table)
        .select("created_at")
        .eq("project_id", projectId)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      return (data as { created_at: string } | null)?.created_at ?? null;
    };
    const [timeline, documents, chat, milestones] = await Promise.all([
      latest("project_updates"),
      latest("project_documents"),
      latest("messages"),
      latest("project_activity"),
    ]);
    setLiveStamps({ milestones, timeline, documents, chat, details: null });
  }, []);

  // Re-reads the project row + section stamps; used by the header Refresh button.
  const refreshProject = useCallback(async () => {
    const { data } = await supabase
      .from("projects")
      .select("id, name, address, current_milestone, milestones, customer_id")
      .eq("customer_id", user.id)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    const p = data as unknown as Project | null;
    setProject(p);
    if (p) await loadLiveStamps(p.id);
  }, [user.id, loadLiveStamps]);

  useEffect(() => {
    let channel: ReturnType<typeof supabase.channel> | null = null;

    supabase
      .from("projects")
      .select("id, name, address, current_milestone, milestones, customer_id")
      .eq("customer_id", user.id)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle()
      .then(({ data }) => {
        const p = data as unknown as Project | null;
        setProject(p);
        setLoading(false);

        if (!p) return;
        void loadLiveStamps(p.id);
        // Live milestone updates: staff edits appear without a reload.

        channel = supabase
          .channel(`project-${p.id}`)
          .on(
            "postgres_changes",
            { event: "UPDATE", schema: "public", table: "projects", filter: `id=eq.${p.id}` },
            (payload) => {
              const next = payload.new as Partial<Project>;
              setProject((prev) => {
                if (!prev) return prev;
                const updated = { ...prev, ...next };
                if (
                  typeof next.current_milestone === "number" &&
                  next.current_milestone !== prev.current_milestone
                ) {
                  const stage =
                    updated.milestones[next.current_milestone]?.name ??
                    `Stage ${next.current_milestone + 1}`;
                  toast.success("Milestone updated", { description: `Now on ${stage}` });
                } else if (next.milestones) {
                  toast.info("Milestone plan updated", {
                    description: "Your project timeline has changed.",
                  });
                }
                return updated;
              });
              void loadLiveStamps(p.id);
            },
          )
          .subscribe((status) => {
            // Realtime dropped: park a reconnect the client can retry from the banner.
            if (status === "CHANNEL_ERROR" || status === "TIMED_OUT" || status === "CLOSED") {
              runWithRetry(
                "Reconnect live project updates",
                async () => {
                  if (channel) await supabase.removeChannel(channel);
                  const state = await new Promise<string>((resolve) => {
                    channel = supabase
                      .channel(`project-${p.id}-retry-${Date.now()}`)
                      .subscribe((s) => {
                        if (
                          s === "SUBSCRIBED" ||
                          s === "CHANNEL_ERROR" ||
                          s === "TIMED_OUT" ||
                          s === "CLOSED"
                        )
                          resolve(s);
                      });
                  });
                  if (state !== "SUBSCRIBED") throw new Error("Live connection unavailable");
                },
                {
                  kind: "realtime",
                  attempts: 2,
                  onSuccess: () => toast.success("Live updates reconnected"),
                },
              );
            }
          });
      });

    return () => {
      if (channel) supabase.removeChannel(channel);
    };
  }, [user.id, loadLiveStamps]);

  if (loading) {
    return (
      <div className="flex justify-center py-24">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  const active = project;

  if (!active) {
    return (
      <div className="mx-auto max-w-2xl px-6 py-24 text-center">
        <p className="eyebrow">Welcome</p>
        <h1 className="mt-3 text-3xl text-foreground">No project assigned yet.</h1>
        <p className="mt-3 text-muted-foreground">
          Your project team will assign you shortly. Please check back soon.
        </p>
      </div>
    );
  }

  const clientName = user.email ?? "Client";
  const initials = clientName
    .split(" ")
    .map((p) => p[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();
  const done = active.milestones.filter((_, i) => i < active.current_milestone).length;
  const pct = active.milestones.length ? Math.round((done / active.milestones.length) * 100) : 0;
  // Newest change per section, so the client can see exactly what moved and when.
  const stamps = liveStamps;
  // Most recent change anywhere on the project, for the "live" badge in the header.
  const lastUpdate = Object.values(liveStamps).filter(Boolean).sort().at(-1) ?? null;

  return (
    <div className="min-h-screen bg-background">
      {/* Personal profile header — no site navigation here on purpose. */}
      <header className="border-b border-border bg-card">
        <div className="mx-auto flex max-w-5xl items-center justify-between gap-4 px-4 py-4 md:px-6">
          <Link
            to="/"
            className="font-display text-base tracking-tight text-muted-foreground hover:text-foreground"
          >
            Locus<span className="text-amber-brand">.</span>Design
          </Link>
          <div className="flex items-center gap-2 sm:gap-3">
            <span className="hidden text-xs text-muted-foreground sm:inline">{user.email}</span>
            <span
              className="inline-flex items-center gap-1.5 rounded-full border border-border px-2.5 py-1 text-xs text-muted-foreground"
              title={
                lastUpdate
                  ? `Last update ${formatTime(lastUpdate)}`
                  : "Connected — watching for updates"
              }
            >
              <span className="relative flex h-1.5 w-1.5">
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-500 opacity-75" />
                <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-emerald-500" />
              </span>
              <span className="hidden sm:inline">
                {lastUpdate ? `Updated ${formatTime(lastUpdate)}` : "Live"}
              </span>
            </span>
            <button
              onClick={() =>
                runWithRetry("Refresh project data", () => refreshProject(), {
                  kind: "sync",
                  onSuccess: () =>
                    toast.success("Refreshed", { description: "Your project data is up to date." }),
                  onFail: (err) => toast.error("Refresh failed", { description: err }),
                })
              }
              className="inline-flex items-center gap-2 rounded-md px-2 py-1.5 text-sm text-muted-foreground transition hover:bg-muted hover:text-foreground"
              aria-label="Refresh project data"
            >
              <RefreshCw className="h-4 w-4" />
              <span className="hidden sm:inline">Refresh</span>
            </button>
            <ThemeToggleSolid />
            <LanguageToggle className="border-border !text-foreground hover:bg-muted" />

            <button
              onClick={async () => {
                await supabase.auth.signOut();
                window.location.href = "/";
              }}
              className="inline-flex items-center gap-2 rounded-md px-2 py-1.5 text-sm text-muted-foreground transition hover:bg-muted hover:text-foreground"
            >
              <LogOut className="h-4 w-4" />
              <span className="hidden sm:inline">Sign out</span>
            </button>
          </div>
        </div>
      </header>

      <div className="mx-auto max-w-5xl px-4 py-8 md:px-6">
        {/* Identity card */}
        <section className="rounded-xl border border-border bg-card p-5 md:p-7">
          <div className="flex flex-col gap-5 md:flex-row md:items-center md:justify-between">
            <div className="flex items-center gap-4">
              <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-full bg-amber-brand text-lg font-semibold text-amber-brand-foreground">
                {initials}
              </div>
              <div className="min-w-0">
                <p className="eyebrow">Client profile</p>
                <h1 className="mt-1 truncate text-2xl text-foreground md:text-3xl">{clientName}</h1>
                <p className="mt-1 text-sm text-muted-foreground">{active.name}</p>
              </div>
            </div>
            <div className="rounded-lg border border-border bg-background px-5 py-4">
              <p className="text-xs uppercase tracking-wide text-muted-foreground">
                Project progress
              </p>
              <div className="mt-1 flex items-baseline gap-2">
                <span className="font-display text-3xl text-foreground">{pct}%</span>
                <span className="text-xs text-muted-foreground">
                  {done}/{active.milestones.length} stages
                </span>
              </div>
              <div className="mt-2 h-1.5 w-40 overflow-hidden rounded-full bg-muted">
                <div
                  className="h-full bg-amber-brand transition-all"
                  style={{ width: `${pct}%` }}
                />
              </div>
            </div>
          </div>

          <dl className="mt-6 grid grid-cols-2 gap-4 border-t border-border pt-5 md:grid-cols-4">
            <Fact
              icon={<MapPin className="h-4 w-4" />}
              label="Site"
              value={active.address ?? "—"}
            />
          </dl>
        </section>

        {/* Anything that failed (upload, message, live connection) with per-item retry. */}
        <RetryBanner />

        {/* Per-section "last updated" strip */}
        <section className="mt-6 flex flex-wrap gap-2">
          {(Object.keys(SECTION_LABELS) as SectionKey[]).map((k) => (
            <span
              key={k}
              title={`${SECTION_LABELS[k]} — ${absoluteTime(stamps[k])}`}
              className="inline-flex items-center gap-1.5 rounded-full border border-border bg-card px-3 py-1 text-xs text-muted-foreground"
            >
              <Clock className="h-3 w-3" />
              <span className="text-foreground">{SECTION_LABELS[k]}</span>
              <span>{relativeTime(stamps[k])}</span>
            </span>
          ))}
        </section>

        {/* Tabs */}
        <div className="mt-6 flex gap-1 overflow-x-auto border-b border-border">
          <TabButton
            active={tab === "milestones"}
            onClick={() => setTab("milestones")}
            icon={<ListChecks className="h-4 w-4" />}
          >
            Milestones
          </TabButton>
          <TabButton
            active={tab === "timeline"}
            onClick={() => setTab("timeline")}
            icon={<Camera className="h-4 w-4" />}
          >
            Timeline
          </TabButton>
          <TabButton
            active={tab === "documents"}
            onClick={() => setTab("documents")}
            icon={<FileText className="h-4 w-4" />}
          >
            Documents
          </TabButton>
          <TabButton
            active={tab === "chat"}
            onClick={() => setTab("chat")}
            icon={<MessageCircle className="h-4 w-4" />}
          >
            Chat
          </TabButton>
        </div>

        <p className="mt-3 text-xs text-muted-foreground">
          {SECTION_LABELS[tab === "timeline" ? "timeline" : tab]} last updated:{" "}
          {absoluteTime(stamps[tab])}
        </p>

        <div className="mt-6">
          {tab === "milestones" && <MilestonePanel project={active} />}
          {tab === "timeline" && <TimelinePanel projectId={active.id} />}
          {tab === "documents" && <DocumentsPanel projectId={active.id} />}
          {tab === "chat" && <ChatPanel projectId={active.id} userId={user.id} />}
        </div>
      </div>
    </div>
  );
}

function Fact({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return (
    <div>
      <dt className="flex items-center gap-1.5 text-xs uppercase tracking-wide text-muted-foreground">
        {icon}
        {label}
      </dt>
      <dd className="mt-1 text-sm text-foreground">{value}</dd>
    </div>
  );
}

function TabButton({
  active,
  onClick,
  icon,
  children,
}: {
  active: boolean;
  onClick: () => void;
  icon: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      className={`inline-flex items-center gap-2 whitespace-nowrap border-b-2 -mb-px px-4 py-3 text-sm transition ${
        active
          ? "border-amber-brand text-foreground"
          : "border-transparent text-muted-foreground hover:text-foreground"
      }`}
    >
      {icon}
      {children}
    </button>
  );
}

export function MilestonePanel({ project }: { project: Project }) {
  useLangTick();
  const current = project.current_milestone;
  const total = project.milestones.length;
  const [open, setOpen] = useState<Record<number, boolean>>({ [current]: true });
  const allOpen = project.milestones.every((_, i) => open[i]);

  const toggleAll = () => {
    const next: Record<number, boolean> = {};
    project.milestones.forEach((_, i) => {
      next[i] = !allOpen;
    });
    setOpen(next);
  };

  const lastUpdated = project.milestones
    .map((m) => m.updated_at)
    .filter(Boolean)
    .sort()
    .pop();

  return (
    <section aria-label="Milestones">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-sm text-foreground">
            Stage {Math.min(current + 1, total)} of {total} —{" "}
            {project.milestones[current]?.name ?? "Complete"}
          </p>
          {lastUpdated && (
            <p className="text-xs text-muted-foreground">Last updated {formatDate(lastUpdated)}</p>
          )}
        </div>
        <button
          onClick={toggleAll}
          className="rounded-md border border-border px-3 py-1.5 text-xs text-muted-foreground transition hover:bg-muted hover:text-foreground"
        >
          {allOpen ? "Collapse all" : "Expand all"}
        </button>
      </div>

      {/* Step strip */}
      <div className="mb-6 flex items-center gap-1" aria-hidden="true">
        {project.milestones.map((_, i) => (
          <div
            key={i}
            className={`h-1.5 flex-1 rounded-full ${i < current ? "bg-amber-brand" : i === current ? "bg-amber-brand/50" : "bg-muted"}`}
          />
        ))}
      </div>

      <ol className="relative space-y-3 border-l border-border pl-6">
        {project.milestones.map((m, i) => {
          const done = i < current;
          const active = i === current;
          const expanded = !!open[i];
          const hasDetail = !!(m.detail || m.checklist?.length);
          return (
            <li key={i} className="relative rounded-lg border border-border bg-card">
              <span className="absolute -left-[31px] top-5 flex h-4 w-4 items-center justify-center rounded-full bg-background">
                {done ? (
                  <CheckCircle2 className="h-4 w-4 text-amber-brand" />
                ) : active ? (
                  <Clock className="h-4 w-4 text-foreground" />
                ) : (
                  <Circle className="h-3.5 w-3.5 text-muted-foreground" />
                )}
              </span>
              <button
                onClick={() => setOpen((p) => ({ ...p, [i]: !p[i] }))}
                aria-expanded={expanded}
                className="flex w-full items-center justify-between gap-3 p-4 text-left"
              >
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-sm font-medium text-foreground">{m.name}</span>
                    <span
                      className={`rounded-full px-2 py-0.5 text-[10px] uppercase tracking-wide ${
                        done
                          ? "bg-amber-brand/15 text-amber-brand"
                          : active
                            ? "bg-foreground text-background"
                            : "bg-muted text-muted-foreground"
                      }`}
                    >
                      {done ? "Completed" : active ? "In progress" : "Upcoming"}
                    </span>
                  </div>
                  <div className="mt-1 text-xs text-muted-foreground">
                    Stage {i + 1} of {total}
                    {m.updated_at && ` · updated ${formatDate(m.updated_at)}`}
                  </div>
                </div>
                {hasDetail && (
                  <ChevronDown
                    className={`h-4 w-4 shrink-0 text-muted-foreground transition-transform ${expanded ? "rotate-180" : ""}`}
                  />
                )}
              </button>

              {expanded && hasDetail && (
                <div className="border-t border-border px-4 py-3">
                  {m.detail && (
                    <p className="text-sm leading-relaxed text-muted-foreground">{m.detail}</p>
                  )}
                  {m.checklist?.length ? (
                    <ul className="mt-3 space-y-1.5">
                      {m.checklist.map((c, ci) => (
                        <li key={ci} className="flex items-start gap-2 text-xs text-foreground">
                          {done ? (
                            <CheckCircle2 className="mt-0.5 h-3.5 w-3.5 shrink-0 text-amber-brand" />
                          ) : (
                            <Circle className="mt-0.5 h-3 w-3 shrink-0 text-muted-foreground" />
                          )}
                          <span>{c}</span>
                        </li>
                      ))}
                    </ul>
                  ) : null}
                </div>
              )}
            </li>
          );
        })}
      </ol>

      <ActivityLog projectId={project.id} />
    </section>
  );
}

/** Audit trail of who changed which milestone and when — live via realtime. */
type ActivityRow = {
  id: string;
  actor: string;
  role: string;
  action: string;
  milestone: string;
  from?: string;
  to?: string;
  created_at: string;
};

function ActivityLog({ projectId }: { projectId: string }) {
  const [showAll, setShowAll] = useState(false);
  const [rows, setRows] = useState<ActivityRow[]>([]);

  const [live, setLive] = useState(false);
  const [newestId, setNewestId] = useState<string | null>(null);
  const listRef = useRef<HTMLOListElement | null>(null);
  const interacting = useRef(false);
  const pendingScroll = useRef(false);

  useEffect(() => {
    let channel: ReturnType<typeof supabase.channel> | null = null;

    supabase
      .from("project_activity")
      .select("id, actor_name, action, milestone, from_status, to_status, created_at")
      .eq("project_id", projectId)
      .order("created_at", { ascending: false })
      .limit(50)
      .then(({ data }) => {
        setRows((data ?? []).map(toRow));

        channel = supabase
          .channel(`activity-${projectId}`)
          .on(
            "postgres_changes",
            {
              event: "INSERT",
              schema: "public",
              table: "project_activity",
              filter: `project_id=eq.${projectId}`,
            },
            (payload) => {
              const row = toRow(payload.new as never);
              setRows((prev) => [row, ...prev]);
              setNewestId(row.id);
              pendingScroll.current = true;
              toast.info("New activity", {
                description: `${row.actor} updated ${row.milestone}${row.to ? ` → ${row.to.replace("_", " ")}` : ""}`,
              });
            },
          )
          .subscribe((status) => setLive(status === "SUBSCRIBED"));
      });

    return () => {
      if (channel) supabase.removeChannel(channel);
    };
  }, [projectId]);

  // Auto-scroll to the newest entry (top of the list, newest-first order),
  // but never while the user is selecting text or hovering/scrolling the list.
  useEffect(() => {
    if (!pendingScroll.current) return;
    pendingScroll.current = false;
    const el = listRef.current;
    if (!el) return;
    const hasSelection = !!window.getSelection()?.toString();
    if (interacting.current || hasSelection) return;
    el.scrollTo({ top: 0, behavior: "smooth" });
  }, [rows]);

  const items = showAll ? rows : rows.slice(0, 4);

  const label = (a: ActivityRow) => {
    if (a.action === "status_change")
      return (
        <>
          moved <span className="text-foreground">{a.milestone}</span> from{" "}
          <em className="not-italic text-muted-foreground">{a.from?.replace("_", " ") ?? "—"}</em>{" "}
          to <span className="text-foreground">{a.to?.replace("_", " ")}</span>
        </>
      );
    if (a.action === "checklist")
      return (
        <>
          completed <span className="text-foreground">{a.to}</span> in {a.milestone}
        </>
      );
    return (
      <>
        added a note on <span className="text-foreground">{a.milestone}</span> — “{a.to}”
      </>
    );
  };

  return (
    <div className="mt-10">
      <div className="mb-4 flex items-center justify-between gap-3">
        <div>
          <h2 className="flex items-center gap-2 text-sm font-medium text-foreground">
            <History className="h-4 w-4 text-amber-brand" /> Activity log
            {live && (
              <span className="inline-flex items-center gap-1.5 rounded-full bg-muted px-2 py-0.5 text-[10px] uppercase tracking-wide text-muted-foreground">
                <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-amber-brand" /> Live
              </span>
            )}
          </h2>
          <p className="text-xs text-muted-foreground">
            Every milestone change, with who made it and when.
          </p>
        </div>
        {rows.length > 4 && (
          <button
            onClick={() => setShowAll((s) => !s)}
            className="rounded-md border border-border px-3 py-1.5 text-xs text-muted-foreground transition hover:bg-muted hover:text-foreground"
          >
            {showAll ? "Show recent" : `Show all (${rows.length})`}
          </button>
        )}
      </div>

      {items.length === 0 ? (
        <p className="rounded-lg border border-dashed border-border p-6 text-center text-sm text-muted-foreground">
          No milestone changes recorded yet.
        </p>
      ) : (
        <ol
          ref={listRef}
          onMouseEnter={() => {
            interacting.current = true;
          }}
          onMouseLeave={() => {
            interacting.current = false;
          }}
          onFocusCapture={() => {
            interacting.current = true;
          }}
          onBlurCapture={() => {
            interacting.current = false;
          }}
          className={`space-y-2 ${showAll ? "max-h-[26rem] overflow-y-auto pr-1" : ""}`}
        >
          {items.map((a) => (
            <li
              key={a.id}
              className={`flex gap-3 rounded-lg border bg-card p-3 transition-colors ${a.id === newestId ? "border-amber-brand/60 bg-amber-brand/5" : "border-border"}`}
            >
              <span className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-muted text-[10px] font-semibold text-foreground">
                {a.actor
                  .split(" ")
                  .map((p) => p[0])
                  .slice(-2)
                  .join("")
                  .toUpperCase()}
              </span>
              <div className="min-w-0">
                <p className="text-sm text-muted-foreground">
                  <span className="font-medium text-foreground">{a.actor}</span> {label(a)}
                </p>
                <p className="mt-0.5 text-xs text-muted-foreground">
                  {a.role} · {formatDateTime(a.created_at)}
                  {a.id === newestId && (
                    <span className="ml-2 rounded-full bg-amber-brand/15 px-1.5 py-0.5 text-[10px] uppercase tracking-wide text-amber-brand">
                      New
                    </span>
                  )}
                </p>
              </div>
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}

function toRow(r: {
  id: string;
  actor_name: string | null;
  action: string;
  milestone: string;
  from_status: string | null;
  to_status: string | null;
  created_at: string;
}): ActivityRow {
  return {
    id: r.id,
    actor: r.actor_name ?? "Project team",
    role: "Project team",
    action: r.action,
    milestone: r.milestone,
    from: r.from_status ?? undefined,
    to: r.to_status ?? undefined,
    created_at: r.created_at,
  };
}

/* ---------------- Real (database-backed) panels ---------------- */

export function TimelinePanel({ projectId }: { projectId: string }) {
  useLangTick();
  const [updates, setUpdates] = useState<Update[] | null>(null);
  const [urls, setUrls] = useState<Record<string, string>>({});

  useEffect(() => {
    supabase
      .from("project_updates")
      .select("id, image_url, caption, created_at")
      .eq("project_id", projectId)
      .order("created_at", { ascending: false })
      .then(async ({ data }) => {
        const list = (data ?? []) as Update[];
        setUpdates(list);
        const map: Record<string, string> = {};
        for (const u of list) {
          if (u.image_url.startsWith("http")) {
            map[u.id] = u.image_url;
          } else {
            const { data: s } = await supabase.storage
              .from("project-images")
              .createSignedUrl(u.image_url, 3600);
            if (s?.signedUrl) map[u.id] = s.signedUrl;
          }
        }
        setUrls(map);
      });
  }, [projectId]);

  if (!updates) return <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />;
  if (updates.length === 0) return <EmptyState label="No updates yet. Check back soon." />;

  return (
    <div className="space-y-6">
      {updates.map((u) => (
        <article key={u.id} className="overflow-hidden rounded-lg border border-border bg-card">
          <div className="aspect-video bg-muted">
            {urls[u.id] && (
              <img
                src={urls[u.id]}
                alt={u.caption ?? "Site update"}
                className="h-full w-full object-cover"
                loading="lazy"
              />
            )}
          </div>
          <div className="p-4">
            <p className="text-xs text-muted-foreground">{formatDateTime(u.created_at)}</p>
            {u.caption && <p className="mt-1 text-sm text-foreground">{u.caption}</p>}
          </div>
        </article>
      ))}
    </div>
  );
}

export function DocumentsPanel({ projectId }: { projectId: string }) {
  useLangTick();
  const [docs, setDocs] = useState<Doc[] | null>(null);

  useEffect(() => {
    supabase
      .from("project_documents")
      .select("id, name, file_path, kind, created_at")
      .eq("project_id", projectId)
      .order("created_at", { ascending: false })
      .then(({ data }) => setDocs((data ?? []) as Doc[]));
  }, [projectId]);

  const download = async (d: Doc) => {
    const { data, error } = await supabase.storage
      .from("project-documents")
      .createSignedUrl(d.file_path, 300, { download: d.name });
    if (error || !data?.signedUrl) return toast.error("Could not create download link");
    window.open(data.signedUrl, "_blank");
  };

  if (!docs) return <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />;
  if (docs.length === 0) return <EmptyState label="No documents yet." />;

  return (
    <ul className="space-y-2">
      {docs.map((d) => (
        <li
          key={d.id}
          className="flex items-center justify-between rounded-md border border-border bg-card p-4"
        >
          <div className="flex min-w-0 items-center gap-3">
            <FileText className="h-5 w-5 shrink-0 text-amber-brand" />
            <div className="min-w-0">
              <div className="truncate text-sm font-medium text-foreground">{d.name}</div>
              <div className="text-xs uppercase tracking-wide text-muted-foreground">
                {formatDocKind(d.kind)}
              </div>
            </div>
          </div>
          <button
            onClick={() => download(d)}
            className="inline-flex items-center gap-2 text-sm text-amber-brand hover:underline"
          >
            <Download className="h-4 w-4" /> Download
          </button>
        </li>
      ))}
    </ul>
  );
}

export function ChatPanel({ projectId, userId }: { projectId: string; userId: string }) {
  useLangTick();
  const [messages, setMessages] = useState<Message[]>([]);
  const [text, setText] = useState("");
  const [sending, setSending] = useState(false);
  const listRef = useRef<HTMLDivElement>(null);

  const scrollBottom = useCallback(() => {
    listRef.current?.scrollTo({ top: listRef.current.scrollHeight, behavior: "smooth" });
  }, []);

  useEffect(() => {
    let mounted = true;
    supabase
      .from("messages")
      .select("id, project_id, sender_id, body, created_at")
      .eq("project_id", projectId)
      .order("created_at", { ascending: true })
      .then(({ data }) => {
        if (!mounted) return;
        setMessages((data ?? []) as Message[]);
        setTimeout(scrollBottom, 50);
      });

    const channel = supabase
      .channel(`messages:${projectId}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "messages",
          filter: `project_id=eq.${projectId}`,
        },
        (payload) => {
          setMessages((prev) => {
            const m = payload.new as Message;
            if (prev.some((x) => x.id === m.id)) return prev;
            return [...prev, m];
          });
          setTimeout(scrollBottom, 50);
        },
      )
      .subscribe();

    return () => {
      mounted = false;
      supabase.removeChannel(channel);
    };
  }, [projectId, scrollBottom]);

  const send = async (e: React.FormEvent) => {
    e.preventDefault();
    const body = text.trim();
    if (!body) return;
    setSending(true);
    const { error } = await supabase
      .from("messages")
      .insert({ project_id: projectId, sender_id: userId, body });
    setSending(false);
    if (error) return toast.error(error.message);
    setText("");
  };

  return (
    <div
      className="flex flex-col rounded-lg border border-border bg-card"
      style={{ height: "min(70vh, 640px)" }}
    >
      <div ref={listRef} className="flex-1 space-y-2 overflow-y-auto p-4">
        {messages.length === 0 && <EmptyState label="No messages yet. Say hello." />}
        {messages.map((m) => {
          const mine = m.sender_id === userId;
          return (
            <div key={m.id} className={`flex ${mine ? "justify-end" : "justify-start"}`}>
              <div
                className={`max-w-[80%] rounded-2xl px-4 py-2 text-sm ${mine ? "rounded-br-sm bg-amber-brand text-amber-brand-foreground" : "rounded-bl-sm bg-muted text-foreground"}`}
              >
                <div>{m.body}</div>
                <div
                  className={`mt-1 text-[10px] ${mine ? "text-amber-brand-foreground/80" : "text-muted-foreground"}`}
                >
                  {formatTime(m.created_at)}
                </div>
              </div>
            </div>
          );
        })}
      </div>
      <form onSubmit={send} className="flex gap-2 border-t border-border p-3">
        <input
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="Message your team…"
          className="flex-1 rounded-full border border-input bg-background px-4 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
        />
        <button
          type="submit"
          disabled={sending || !text.trim()}
          className="inline-flex h-10 w-10 items-center justify-center rounded-full bg-amber-brand text-amber-brand-foreground disabled:opacity-50"
        >
          {sending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
        </button>
      </form>
    </div>
  );
}

function EmptyState({ label }: { label: string }) {
  return (
    <div className="rounded-md border border-dashed border-border bg-card p-8 text-center text-sm text-muted-foreground">
      {label}
    </div>
  );
}
