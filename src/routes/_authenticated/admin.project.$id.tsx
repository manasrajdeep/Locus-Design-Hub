import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import imageCompression from "browser-image-compression";
import { toast } from "sonner";
import {
  ArrowLeft,
  Loader2,
  Upload,
  FileText,
  Camera,
  ListChecks,
  MessageCircle,
  Trash2,
  SlidersHorizontal,
  Plus,
  Save,
} from "lucide-react";
import { MilestonePanel, TimelinePanel, DocumentsPanel, ChatPanel } from "./portal";

type Milestone = { name: string; status: "pending" | "in_progress" | "done" };
type Project = {
  id: string;
  name: string;
  address: string | null;
  current_milestone: number;
  milestones: Milestone[];
  customer_id: string;
  assigned_admin_id: string | null;
};

export const Route = createFileRoute("/_authenticated/admin/project/$id")({
  head: () => ({
    meta: [{ title: "Project — Admin — Locus Design" }, { name: "robots", content: "noindex" }],
  }),
  component: AdminProject,
});

function AdminProject() {
  const { id } = Route.useParams();
  const { user } = Route.useRouteContext();
  const [project, setProject] = useState<Project | null>(null);
  const [tab, setTab] = useState<"details" | "milestones" | "timeline" | "documents" | "chat">(
    "milestones",
  );

  const load = () => {
    supabase
      .from("projects")
      .select("*")
      .eq("id", id)
      .maybeSingle()
      .then(({ data }) => setProject(data as unknown as Project | null));
  };
  useEffect(load, [id]);

  if (!project)
    return (
      <div className="flex justify-center py-24">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );

  return (
    <div className="mx-auto max-w-4xl px-4 md:px-6 py-8">
      <Link
        to="/admin/dashboard"
        className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="h-4 w-4" /> Back
      </Link>
      <p className="eyebrow mt-4">Project</p>
      <h1 className="mt-2 text-3xl md:text-4xl text-foreground">{project.name}</h1>
      {project.address && <p className="mt-1 text-sm text-muted-foreground">{project.address}</p>}

      <div className="mt-6 flex overflow-x-auto gap-1 border-b border-border">
        {(["details", "milestones", "timeline", "documents", "chat"] as const).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`inline-flex items-center gap-2 px-4 py-3 text-sm border-b-2 -mb-px transition whitespace-nowrap capitalize ${
              tab === t
                ? "border-amber-brand text-foreground"
                : "border-transparent text-muted-foreground hover:text-foreground"
            }`}
          >
            {t === "details" ? (
              <SlidersHorizontal className="h-4 w-4" />
            ) : t === "milestones" ? (
              <ListChecks className="h-4 w-4" />
            ) : t === "timeline" ? (
              <Camera className="h-4 w-4" />
            ) : t === "documents" ? (
              <FileText className="h-4 w-4" />
            ) : (
              <MessageCircle className="h-4 w-4" />
            )}
            {t}
          </button>
        ))}
      </div>

      <div className="mt-8">
        {tab === "details" && <AdminDetails project={project} onChange={load} />}
        {tab === "milestones" && <AdminMilestones project={project} actor={user} onChange={load} />}
        {tab === "timeline" && <AdminTimeline projectId={project.id} onChange={load} />}
        {tab === "documents" && <AdminDocuments projectId={project.id} />}
        {tab === "chat" && <ChatPanel projectId={project.id} userId={user.id} />}
      </div>
    </div>
  );
}

/**
 * Editable project details.
 *
 * Provisioning names a project `"<customer> — Project"` and leaves the address
 * null, and nothing else could change either afterwards — the name, address and
 * milestone labels were rendered as static text, so a typo at provisioning time
 * was permanent. The row was always writable (the `projects: staff update`
 * policy), so this only ever needed the UI.
 */
function AdminDetails({ project, onChange }: { project: Project; onChange: () => void }) {
  const [name, setName] = useState(project.name);
  const [address, setAddress] = useState(project.address ?? "");
  const [milestones, setMilestones] = useState<Milestone[]>(project.milestones ?? []);
  const [busy, setBusy] = useState(false);

  const renameMilestone = (i: number, value: string) =>
    setMilestones((ms) => ms.map((m, j) => (j === i ? { ...m, name: value } : m)));

  const removeMilestone = (i: number) => setMilestones((ms) => ms.filter((_, j) => j !== i));

  const addMilestone = () =>
    setMilestones((ms) => [...ms, { name: "", status: "pending" as const }]);

  const save = async () => {
    const cleaned = milestones
      .map((m) => ({ ...m, name: m.name.trim() }))
      .filter((m) => m.name.length > 0);

    if (!name.trim()) return toast.error("Project name cannot be empty");
    if (cleaned.length === 0) return toast.error("Keep at least one milestone");

    setBusy(true);
    const { error } = await supabase
      .from("projects")
      .update({
        name: name.trim(),
        address: address.trim() || null,
        milestones: cleaned,
        // Deleting milestones can strand current_milestone past the end, which
        // would leave the customer's portal pointing at a stage that is gone.
        current_milestone: Math.min(project.current_milestone, cleaned.length - 1),
      })
      .eq("id", project.id);
    setBusy(false);

    if (error) return toast.error(error.message);
    onChange();
    toast.success("Project details saved");
  };

  const field =
    "w-full rounded-md border border-input bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:border-amber-brand focus:outline-none";

  return (
    <div className="rounded-lg border border-border bg-card p-6">
      <p className="eyebrow">Project details</p>

      <div className="mt-4 space-y-4">
        <div>
          <label htmlFor="project-name" className="text-sm font-medium text-foreground">
            Name
          </label>
          <input
            id="project-name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            className={`mt-1.5 ${field}`}
            placeholder="Chandigarh Residence"
          />
        </div>

        <div>
          <label htmlFor="project-address" className="text-sm font-medium text-foreground">
            Address
          </label>
          <input
            id="project-address"
            value={address}
            onChange={(e) => setAddress(e.target.value)}
            className={`mt-1.5 ${field}`}
            placeholder="Sector 9, Chandigarh"
          />
          <p className="mt-1 text-xs text-muted-foreground">
            Shown to the customer under the project title. Leave blank to hide it.
          </p>
        </div>

        <div>
          <p className="text-sm font-medium text-foreground">Milestones</p>
          <p className="mt-1 text-xs text-muted-foreground">
            These are the stages the customer sees on their timeline.
          </p>
          <div className="mt-2 space-y-2">
            {milestones.map((m, i) => (
              <div key={i} className="flex items-center gap-2">
                <span className="w-6 shrink-0 text-xs text-muted-foreground">{i + 1}.</span>
                <input
                  value={m.name}
                  onChange={(e) => renameMilestone(i, e.target.value)}
                  className={field}
                  placeholder="Stage name"
                  aria-label={`Milestone ${i + 1} name`}
                />
                <button
                  type="button"
                  onClick={() => removeMilestone(i)}
                  disabled={milestones.length <= 1}
                  aria-label={`Remove milestone ${i + 1}`}
                  className="shrink-0 rounded-md p-2 text-muted-foreground hover:text-destructive disabled:opacity-40"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>
            ))}
          </div>
          <button
            type="button"
            onClick={addMilestone}
            className="mt-2 inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
          >
            <Plus className="h-4 w-4" /> Add milestone
          </button>
        </div>
      </div>

      <button
        onClick={save}
        disabled={busy}
        className="mt-6 inline-flex items-center gap-2 rounded-md bg-amber-brand-strong px-4 py-2.5 text-sm font-medium text-amber-brand-foreground transition hover:opacity-90 disabled:opacity-60"
      >
        {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
        Save changes
      </button>
    </div>
  );
}

function AdminMilestones({
  project,
  actor,
  onChange,
}: {
  project: Project;
  actor: { id: string; email?: string };
  onChange: () => void;
}) {
  const [busy, setBusy] = useState(false);
  const setCurrent = async (idx: number) => {
    setBusy(true);
    const previous = project.current_milestone;
    const { error } = await supabase
      .from("projects")
      .update({ current_milestone: idx })
      .eq("id", project.id);
    if (!error) {
      // The portal's activity log is fed from here — every stage change is recorded.
      await supabase.from("project_activity").insert({
        project_id: project.id,
        actor_id: actor.id,
        actor_name: actor.email ?? null,
        action: "status_change",
        milestone: project.milestones[idx]?.name ?? `Stage ${idx + 1}`,
        from_status: project.milestones[previous]?.name ?? null,
        to_status: "in_progress",
      });
    }
    setBusy(false);
    if (error) return toast.error(error.message);
    onChange();
    toast.success("Milestone updated");
  };

  return (
    <div>
      <MilestonePanel project={project} />
      <div className="mt-6 rounded-lg border border-border bg-card p-6">
        <p className="eyebrow">Set current milestone</p>
        <div className="mt-3 flex flex-wrap gap-2">
          {project.milestones.map((m, i) => (
            <button
              key={i}
              disabled={busy}
              onClick={() => setCurrent(i)}
              className={`rounded-full px-3 py-1.5 text-xs transition ${
                i === project.current_milestone
                  ? "bg-amber-brand-strong text-amber-brand-foreground"
                  : "bg-muted text-foreground hover:bg-accent"
              }`}
            >
              {i + 1}. {m.name}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

function AdminTimeline({
  projectId,
  onChange: _onChange,
}: {
  projectId: string;
  onChange: () => void;
}) {
  const [uploading, setUploading] = useState(false);
  const [caption, setCaption] = useState("");
  const [refreshKey, setRefreshKey] = useState(0);
  const fileRef = useRef<HTMLInputElement>(null);
  const { user } = Route.useRouteContext();

  const onUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    try {
      const compressed = await imageCompression(file, {
        maxSizeMB: 1,
        maxWidthOrHeight: 1920,
        useWebWorker: true,
      });
      const path = `${projectId}/${Date.now()}-${compressed.name.replace(/\s+/g, "-")}`;
      const { error: upErr } = await supabase.storage
        .from("project-images")
        .upload(path, compressed, {
          contentType: compressed.type,
        });
      if (upErr) throw upErr;
      const { error: dbErr } = await supabase.from("project_updates").insert({
        project_id: projectId,
        image_url: path,
        caption: caption || null,
        created_by: user.id,
      });
      if (dbErr) throw dbErr;
      toast.success("Update posted");
      setCaption("");
      setRefreshKey((k) => k + 1);
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Upload failed");
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  };

  return (
    <div>
      <div className="rounded-lg border border-border bg-card p-6">
        <p className="eyebrow">Post daily update</p>
        <input
          type="text"
          placeholder="Caption (optional)"
          value={caption}
          onChange={(e) => setCaption(e.target.value)}
          className="mt-3 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
        />
        <div className="mt-3">
          <input
            ref={fileRef}
            type="file"
            accept="image/*"
            onChange={onUpload}
            className="hidden"
            id="upload-image"
          />
          <label htmlFor="upload-image" className="btn-primary cursor-pointer">
            {uploading ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Upload className="h-4 w-4" />
            )}
            {uploading ? "Uploading…" : "Upload photo"}
          </label>
        </div>
      </div>
      <div className="mt-6" key={refreshKey}>
        <TimelinePanel projectId={projectId} />
      </div>
    </div>
  );
}

type Doc = { id: string; name: string; file_path: string; kind: string; created_at: string };

function AdminDocuments({ projectId }: { projectId: string }) {
  const [uploading, setUploading] = useState(false);
  const [kind, setKind] = useState("contract");
  const [docs, setDocs] = useState<Doc[] | null>(null);
  const { user } = Route.useRouteContext();
  const fileRef = useRef<HTMLInputElement>(null);

  const load = () => {
    supabase
      .from("project_documents")
      .select("*")
      .eq("project_id", projectId)
      .order("created_at", { ascending: false })
      .then(({ data }) => setDocs((data ?? []) as Doc[]));
  };
  useEffect(load, [projectId]);

  const onUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    try {
      const path = `${projectId}/${Date.now()}-${file.name.replace(/\s+/g, "-")}`;
      const { error: upErr } = await supabase.storage.from("project-documents").upload(path, file, {
        contentType: file.type,
      });
      if (upErr) throw upErr;
      const { error: dbErr } = await supabase.from("project_documents").insert({
        project_id: projectId,
        name: file.name,
        file_path: path,
        kind,
        uploaded_by: user.id,
      });
      if (dbErr) throw dbErr;
      toast.success("Document uploaded");
      load();
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Upload failed");
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  };

  const remove = async (d: Doc) => {
    if (!confirm(`Delete ${d.name}?`)) return;
    await supabase.storage.from("project-documents").remove([d.file_path]);
    await supabase.from("project_documents").delete().eq("id", d.id);
    load();
  };

  return (
    <div>
      <div className="rounded-lg border border-border bg-card p-6">
        <p className="eyebrow">Upload document</p>
        <div className="mt-3 flex flex-wrap items-center gap-3">
          <select
            value={kind}
            onChange={(e) => setKind(e.target.value)}
            className="rounded-md border border-input bg-background px-3 py-2 text-sm"
          >
            <option value="contract">Contract</option>
            <option value="invoice">Invoice</option>
            <option value="permit">Permit</option>
            <option value="other">Other</option>
          </select>
          <input
            ref={fileRef}
            type="file"
            accept=".pdf,application/pdf"
            onChange={onUpload}
            className="hidden"
            id="upload-doc"
          />
          <label htmlFor="upload-doc" className="btn-primary cursor-pointer">
            {uploading ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Upload className="h-4 w-4" />
            )}
            {uploading ? "Uploading…" : "Upload PDF"}
          </label>
        </div>
      </div>

      <ul className="mt-6 space-y-2">
        {docs?.map((d) => (
          <li
            key={d.id}
            className="flex items-center justify-between rounded-md border border-border bg-card p-4"
          >
            <div className="flex items-center gap-3 min-w-0">
              <FileText className="h-5 w-5 text-amber-brand shrink-0" />
              <div className="min-w-0">
                <div className="truncate text-sm font-medium text-foreground">{d.name}</div>
                <div className="text-xs text-muted-foreground uppercase">{d.kind}</div>
              </div>
            </div>
            <button
              onClick={() => remove(d)}
              className="text-muted-foreground hover:text-destructive"
            >
              <Trash2 className="h-4 w-4" />
            </button>
          </li>
        ))}
        {docs?.length === 0 && <p className="text-sm text-muted-foreground">No documents yet.</p>}
      </ul>

      {/* preview for consistency */}
      <div className="mt-8">
        <p className="eyebrow mb-2">Customer view</p>
        <DocumentsPanel projectId={projectId} />
      </div>
    </div>
  );
}
