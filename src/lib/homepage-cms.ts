import { supabase } from "@/integrations/supabase/client";
import type { ImageVariantMap } from "@/lib/image-registry";
import {
  mergeSections,
  type HomepagePortfolio,
  type HomepageSections,
  type HomepageService,
  type HomepageStat,
} from "@/lib/homepage";

/** The editable shape of the homepage — stored live in columns and as a draft/version JSON blob. */
export interface HomepageDraft {
  hero_title: string;
  hero_subtitle: string;
  hero_image_url: string;
  stats: HomepageStat[];
  services: HomepageService[];
  portfolio: HomepagePortfolio[];
  sections: HomepageSections;
  /** Responsive variants for uploaded images, keyed by public URL. */
  image_variants: ImageVariantMap;
}

export interface HomepageEditorState {
  id: string;
  /** Live, publicly visible content. */
  published: HomepageDraft;
  /** Work in progress; equals `published` right after a publish. */
  draft: HomepageDraft;
  draft_updated_at: string | null;
  published_at: string | null;
}

export interface HomepageVersion {
  id: string;
  note: string;
  created_at: string;
  content: HomepageDraft;
}

function normalise(
  raw: Partial<HomepageDraft> | null | undefined,
  fallback?: HomepageDraft,
): HomepageDraft {
  const base = fallback;
  return {
    hero_title: raw?.hero_title ?? base?.hero_title ?? "",
    hero_subtitle: raw?.hero_subtitle ?? base?.hero_subtitle ?? "",
    hero_image_url: raw?.hero_image_url ?? base?.hero_image_url ?? "",
    stats: raw?.stats ?? base?.stats ?? [],
    services: raw?.services ?? base?.services ?? [],
    portfolio: raw?.portfolio ?? base?.portfolio ?? [],
    sections: mergeSections(raw?.sections ?? base?.sections),
    // Additive: an image published in an older version must keep resolving even
    // after newer uploads, so merge rather than replace.
    image_variants: { ...(base?.image_variants ?? {}), ...(raw?.image_variants ?? {}) },
  };
}

/** Loads both the published content and the saved draft for the editor. */
export async function fetchEditorState(): Promise<HomepageEditorState | null> {
  const { data, error } = await supabase
    .from("homepage_content")
    .select("*")
    .limit(1)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) return null;
  const row = data as unknown as Record<string, unknown>;
  const published = normalise(row as unknown as Partial<HomepageDraft>);
  const id = String(row["id"]);

  // Drafts live in a superadmin-only table so unpublished content is never public.
  const { data: draftRow, error: draftError } = await supabase
    .from("homepage_drafts")
    .select("content, updated_at")
    .eq("content_id", id)
    .maybeSingle();
  if (draftError) throw new Error(draftError.message);
  const draftRaw = (draftRow?.content ?? null) as Partial<HomepageDraft> | null;
  const hasDraft = draftRaw && Object.keys(draftRaw).length > 0;
  return {
    id,
    published,
    draft: hasDraft ? normalise(draftRaw, published) : published,
    draft_updated_at: (draftRow?.updated_at as string | null) ?? null,
    published_at: (row["published_at"] as string | null) ?? null,
  };
}

/** Saves the working copy without changing anything visitors can see. */
export async function saveDraft(id: string, draft: HomepageDraft): Promise<string> {
  const updated_at = new Date().toISOString();
  const { data, error } = await supabase
    .from("homepage_drafts")
    .upsert({ content_id: id, content: draft, updated_at } as never, { onConflict: "content_id" })
    .select("id");
  if (error) throw new Error(error.message);
  if (!data || data.length === 0) {
    throw new Error("Draft not saved — you need publishing rights to edit the homepage.");
  }
  return updated_at;
}

/** Copies the draft into the live columns and records a version snapshot. */
export async function publishDraft(
  id: string,
  draft: HomepageDraft,
  note = "Published",
): Promise<string> {
  const published_at = new Date().toISOString();
  const { data, error } = await supabase
    .from("homepage_content")
    .update({
      hero_title: draft.hero_title,
      hero_subtitle: draft.hero_subtitle,
      hero_image_url: draft.hero_image_url,
      stats: draft.stats,
      services: draft.services,
      portfolio: draft.portfolio,
      sections: draft.sections,
      image_variants: draft.image_variants,
      published_at,
      updated_at: published_at,
    } as never)
    .eq("id", id)
    .select("id");
  if (error) throw new Error(error.message);
  if (!data || data.length === 0) {
    throw new Error("Nothing was published — you need publishing rights to change the homepage.");
  }

  // Keep the draft in sync so the editor shows "everything published".
  const { error: draftSyncError } = await supabase
    .from("homepage_drafts")
    .upsert({ content_id: id, content: draft, updated_at: published_at } as never, {
      onConflict: "content_id",
    });
  if (draftSyncError) throw new Error(draftSyncError.message);

  const { data: user } = await supabase.auth.getUser();
  const { error: versionError } = await supabase
    .from("homepage_versions")
    .insert({ content: draft, note, created_by: user.user?.id ?? null } as never);
  // A failed snapshot must not read as a failed publish — the page is already live.
  if (versionError)
    throw new Error(`Published, but the version snapshot failed: ${versionError.message}`);
  return published_at;
}

export async function fetchVersions(limit = 30): Promise<HomepageVersion[]> {
  const { data, error } = await supabase
    .from("homepage_versions")
    .select("id, note, created_at, content")
    .order("created_at", { ascending: false })
    .limit(limit);
  if (error) throw new Error(error.message);
  return ((data ?? []) as unknown as HomepageVersion[]).map((v) => ({
    ...v,
    content: normalise(v.content),
  }));
}
