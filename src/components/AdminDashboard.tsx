import { formatDate, useLangTick } from "@/lib/i18n-format";
import { Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Loader2, UserPlus, ChevronRight, Check, X, Users, Mail, Trash2 } from "lucide-react";
import { toast } from "sonner";

type Project = { id: string; name: string; address: string | null; customer_id: string };
type Customer = { id: string; email: string; full_name: string | null };
type ContactMessage = {
  id: string;
  name: string;
  email: string;
  message: string;
  created_at: string;
};
type AccessRequest = {
  id: string;
  user_id: string;
  email: string;
  full_name: string | null;
  status: string;
  created_at: string;
};

export function AdminDashboard({ userId }: { userId: string; projectHrefPrefix?: string }) {
  useLangTick();
  const [projects, setProjects] = useState<Project[] | null>(null);
  const [customersById, setCustomersById] = useState<Record<string, Customer>>({});
  const [selectedCustomerId, setSelectedCustomerId] = useState<string>("");
  const [requests, setRequests] = useState<AccessRequest[] | null>(null);
  const [messages, setMessages] = useState<ContactMessage[] | null>(null);
  const [busy, setBusy] = useState(false);

  const loadProjects = async () => {
    const { data } = await supabase
      .from("projects")
      .select("id, name, address, customer_id")
      .order("created_at", { ascending: false });
    const list = (data ?? []) as Project[];
    setProjects(list);
    const ids = Array.from(new Set(list.map((p) => p.customer_id)));
    if (ids.length) {
      const { data: profs } = await supabase
        .from("profiles")
        .select("id, email, full_name")
        .in("id", ids);
      const map: Record<string, Customer> = {};
      (profs ?? []).forEach((p) => {
        map[p.id] = p as Customer;
      });
      setCustomersById(map);
    }
  };
  const loadRequests = async () => {
    const { data } = await supabase
      .from("access_requests")
      .select("id, user_id, email, full_name, status, created_at")
      .eq("status", "pending")
      .order("created_at", { ascending: false });
    setRequests((data ?? []) as AccessRequest[]);
  };

  /**
   * Website enquiries.
   *
   * The public contact form writes straight to `contact_messages` and nothing
   * read it — no screen, no notification — so an enquiry sat in the database
   * unseen. Staff-only by policy; `anon` may insert but never select.
   */
  const loadMessages = async () => {
    const { data } = await supabase
      .from("contact_messages")
      .select("id, name, email, message, created_at")
      .order("created_at", { ascending: false })
      .limit(100);
    setMessages((data ?? []) as ContactMessage[]);
  };

  const deleteMessage = async (id: string) => {
    const { error } = await supabase.from("contact_messages").delete().eq("id", id);
    if (error) return toast.error(error.message);
    setMessages((ms) => (ms ?? []).filter((m) => m.id !== id));
  };

  useEffect(() => {
    loadProjects();
    loadRequests();
    loadMessages();
  }, []);

  const activeProjects = projects ?? [];
  const selectedProject = activeProjects.find((p) => p.customer_id === selectedCustomerId);

  const provision = async (req: AccessRequest) => {
    setBusy(true);
    const projectName = (req.full_name ?? req.email.split("@")[0]) + " — Project";
    const { error: pErr } = await supabase.from("projects").insert({
      name: projectName,
      customer_id: req.user_id,
      assigned_admin_id: userId,
    });
    if (pErr) {
      setBusy(false);
      return toast.error(pErr.message);
    }
    await supabase.from("access_requests").update({ status: "approved" }).eq("id", req.id);
    await loadProjects();
    await loadRequests();
    setBusy(false);
    toast.success("Profile created — customer now has portal access");
  };

  const reject = async (req: AccessRequest) => {
    const { error } = await supabase
      .from("access_requests")
      .update({ status: "rejected" })
      .eq("id", req.id);
    if (error) return toast.error(error.message);
    loadRequests();
  };

  return (
    <div className="mx-auto max-w-6xl px-4 md:px-6 py-8 space-y-12">
      <div>
        <p className="eyebrow">Admin</p>
        <h1 className="mt-2 text-3xl md:text-4xl text-foreground">Manage clients</h1>
      </div>

      {/* Top: Customer dropdown */}
      <section>
        <div className="flex items-center gap-2 mb-4">
          <Users className="h-4 w-4 text-muted-foreground" />
          <h2 className="text-sm font-medium text-foreground uppercase tracking-wider">
            Active clients
          </h2>
        </div>
        {projects === null ? (
          <Loader2 className="h-5 w-5 animate-spin" />
        ) : activeProjects.length === 0 ? (
          <p className="text-sm text-muted-foreground">No active clients yet.</p>
        ) : (
          <>
            <label className="text-xs font-medium tracking-wide text-foreground">
              Select a client to manage
            </label>
            <select
              value={selectedCustomerId}
              onChange={(e) => setSelectedCustomerId(e.target.value)}
              className="mt-1 w-full max-w-md rounded-md border border-input bg-background px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
            >
              <option value="">— Choose a client —</option>
              {activeProjects.map((p) => {
                const c = customersById[p.customer_id];
                const label = c ? `${c.full_name ?? c.email} · ${p.name}` : p.name;
                return (
                  <option key={p.id} value={p.customer_id}>
                    {label}
                  </option>
                );
              })}
            </select>

            {selectedProject && (
              <div className="mt-4 rounded-md border border-border bg-card p-5">
                <div className="flex items-center justify-between">
                  <div>
                    <div className="text-sm font-medium text-foreground">
                      {selectedProject.name}
                    </div>
                    {selectedProject.address && (
                      <div className="text-xs text-muted-foreground">{selectedProject.address}</div>
                    )}
                    {customersById[selectedProject.customer_id] && (
                      <div className="mt-1 text-xs text-muted-foreground">
                        {customersById[selectedProject.customer_id].email}
                      </div>
                    )}
                  </div>
                  <Link
                    to="/admin/project/$id"
                    params={{ id: selectedProject.id }}
                    className="btn-primary text-xs"
                  >
                    Manage timeline & documents <ChevronRight className="h-4 w-4" />
                  </Link>
                </div>
              </div>
            )}
          </>
        )}
      </section>

      {/* Middle: Access requests */}
      <section>
        <div className="flex items-center gap-2 mb-4">
          <UserPlus className="h-4 w-4 text-muted-foreground" />
          <h2 className="text-sm font-medium text-foreground uppercase tracking-wider">
            Access requests
          </h2>
        </div>
        {requests === null ? (
          <Loader2 className="h-5 w-5 animate-spin" />
        ) : requests.length === 0 ? (
          <p className="text-sm text-muted-foreground">No pending requests.</p>
        ) : (
          <ul className="space-y-2">
            {requests.map((r) => (
              <li
                key={r.id}
                className="flex items-center justify-between gap-3 rounded-md border border-border bg-card p-4"
              >
                <div className="min-w-0">
                  <div className="text-sm font-medium text-foreground truncate">
                    {r.full_name ?? r.email}
                  </div>
                  <div className="text-xs text-muted-foreground truncate">{r.email}</div>
                  <div className="text-[10px] text-muted-foreground mt-1">
                    Requested {formatDate(r.created_at)}
                  </div>
                </div>
                <div className="flex gap-2 shrink-0">
                  <button
                    disabled={busy}
                    onClick={() => provision(r)}
                    className="inline-flex items-center gap-1 rounded-md bg-amber-brand text-amber-brand-foreground px-3 py-1.5 text-xs font-medium hover:opacity-90 disabled:opacity-50"
                  >
                    <Check className="h-3.5 w-3.5" /> Accept &amp; create profile
                  </button>
                  <button
                    onClick={() => reject(r)}
                    className="inline-flex items-center gap-1 rounded-md border border-border px-3 py-1.5 text-xs text-muted-foreground hover:text-destructive"
                  >
                    <X className="h-3.5 w-3.5" /> Reject
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* Website enquiries from the public contact form */}
      <section>
        <h2 className="mb-4 flex items-center gap-2 text-sm font-medium uppercase tracking-wider text-foreground">
          <Mail className="h-4 w-4" /> Website enquiries
          {messages && messages.length > 0 && (
            <span className="rounded-full bg-amber-brand px-2 py-0.5 text-xs text-amber-brand-foreground">
              {messages.length}
            </span>
          )}
        </h2>
        {messages === null ? (
          <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
        ) : messages.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            No enquiries yet. Messages sent through the contact form on the homepage appear here.
          </p>
        ) : (
          <ul className="space-y-3">
            {messages.map((m) => (
              <li key={m.id} className="rounded-md border border-border bg-card p-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="text-sm font-medium text-foreground">{m.name}</div>
                    <a
                      href={`mailto:${m.email}?subject=${encodeURIComponent("Re: your enquiry — Locus Design")}`}
                      className="text-xs text-amber-brand hover:underline"
                    >
                      {m.email}
                    </a>
                  </div>
                  <div className="flex shrink-0 items-center gap-3">
                    <span className="text-xs text-muted-foreground">
                      {formatDate(m.created_at)}
                    </span>
                    <button
                      onClick={() => deleteMessage(m.id)}
                      aria-label={`Delete enquiry from ${m.name}`}
                      className="rounded p-1 text-muted-foreground transition hover:text-destructive"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                </div>
                <p className="mt-3 whitespace-pre-wrap text-sm text-muted-foreground">
                  {m.message}
                </p>
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* Bottom: all projects list */}
      <section>
        <h2 className="text-sm font-medium text-foreground uppercase tracking-wider mb-4">
          All projects
        </h2>
        {activeProjects.length === 0 ? (
          <p className="text-sm text-muted-foreground">No projects yet.</p>
        ) : (
          <ul className="grid gap-3 sm:grid-cols-2">
            {activeProjects.map((p) => (
              <li key={p.id}>
                <Link
                  to="/admin/project/$id"
                  params={{ id: p.id }}
                  className="flex items-center justify-between rounded-md border border-border bg-card p-4 hover:border-amber-brand transition"
                >
                  <div className="min-w-0">
                    <div className="truncate text-sm font-medium text-foreground">{p.name}</div>
                    {p.address && (
                      <div className="truncate text-xs text-muted-foreground">{p.address}</div>
                    )}
                  </div>
                  <ChevronRight className="h-5 w-5 text-muted-foreground shrink-0" />
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
