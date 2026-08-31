/**
 * Per-section "last updated" formatting for the client portal.
 *
 * The portal reads the newest row per section (photos, documents, chat and
 * milestone activity) and renders the stamp both as a relative string ("2 hours
 * ago") and an absolute one. Formatting follows the active language, so these
 * helpers are locale aware rather than hardcoding English.
 */
import { formatDate, formatDateTime, formatNumber, relativeStrings } from "./i18n-format";

export type SectionKey = "milestones" | "timeline" | "documents" | "chat" | "details";

const newest = (dates: (string | undefined | null)[]): string | null => {
  const valid = dates.filter((d): d is string => !!d && !Number.isNaN(Date.parse(d)));
  if (!valid.length) return null;
  return valid.reduce((a, b) => (Date.parse(b) > Date.parse(a) ? b : a));
};

export function relativeTime(iso: string | null | undefined): string {
  const r = relativeStrings();
  if (!iso) return r.none;
  const t = Date.parse(iso);
  if (Number.isNaN(t)) return r.none;
  const mins = Math.round((Date.now() - t) / 60000);
  if (mins < 1) return r.now;
  if (mins < 60) return r.min(formatNumber(mins));
  const hours = Math.round(mins / 60);
  if (hours < 24) return r.hr(formatNumber(hours), hours === 1);
  const days = Math.round(hours / 24);
  if (days <= 30) return r.day(formatNumber(days), days === 1);
  return formatDate(t);
}

export function absoluteTime(iso: string | null | undefined): string {
  const r = relativeStrings();
  if (!iso) return r.noChanges;
  const t = Date.parse(iso);
  if (Number.isNaN(t)) return r.noChanges;
  return formatDateTime(t);
}

export const SECTION_LABELS: Record<SectionKey, string> = {
  milestones: "Milestones",
  timeline: "Photos",
  documents: "Documents",
  chat: "Chat",
  details: "Details",
};
