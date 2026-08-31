/**
 * Locale-aware date / number / file-size formatting.
 *
 * The active language is set once by <LanguageProvider>; every formatter below
 * reads that module-level value so plain (non-React) helpers such as
 * demo-timestamps can stay locale aware without prop drilling.
 */
export type AppLang = "en" | "hi";

let activeLang: AppLang = "en";
const listeners = new Set<(lang: AppLang) => void>();

export function setActiveLang(lang: AppLang) {
  activeLang = lang;
  listeners.forEach((l) => l(lang));
}
export function getActiveLang(): AppLang {
  return activeLang;
}
export function onLangChange(fn: (lang: AppLang) => void) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

const locale = () => (activeLang === "hi" ? "hi-IN" : "en-IN");

const parse = (value: string | number | Date | null | undefined): Date | null => {
  if (value === null || value === undefined) return null;
  const d = value instanceof Date ? value : new Date(value);
  return Number.isNaN(d.getTime()) ? null : d;
};

export function formatDate(value: string | number | Date | null | undefined): string {
  const d = parse(value);
  if (!d) return "";
  return d.toLocaleDateString(locale(), { day: "numeric", month: "short", year: "numeric" });
}

export function formatDateTime(value: string | number | Date | null | undefined): string {
  const d = parse(value);
  if (!d) return "";
  return d.toLocaleString(locale(), {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

export function formatTime(value: string | number | Date | null | undefined): string {
  const d = parse(value);
  if (!d) return "";
  return d.toLocaleTimeString(locale(), { hour: "2-digit", minute: "2-digit" });
}

export function formatNumber(value: number, options?: Intl.NumberFormatOptions): string {
  return new Intl.NumberFormat(locale(), options).format(value);
}

const UNITS: Record<AppLang, { kb: string; mb: string }> = {
  en: { kb: "KB", mb: "MB" },
  hi: { kb: "केबी", mb: "एमबी" },
};

/** Localised file size, e.g. "1.2 MB" / "1.2 एमबी". */
export function formatFileSize(bytes: number): string {
  const u = UNITS[activeLang];
  if (bytes < 1024 * 1024) {
    return `${formatNumber(Math.max(1, Math.round(bytes / 1024)))} ${u.kb}`;
  }
  return `${formatNumber(bytes / (1024 * 1024), { maximumFractionDigits: 1 })} ${u.mb}`;
}

/** Re-localise an already-formatted "1.2 MB" / "320 KB" string. */
export function localizeFileSize(size: string | null | undefined): string {
  if (!size) return "";
  const m = size.match(/^([\d.,]+)\s*(KB|MB|केबी|एमबी)$/i);
  if (!m) return size;
  const num = Number(m[1].replace(/,/g, ""));
  if (Number.isNaN(num)) return size;
  const isKb = /^(kb|केबी)$/i.test(m[2]);
  const u = UNITS[activeLang];
  return `${formatNumber(num, { maximumFractionDigits: 1 })} ${isKb ? u.kb : u.mb}`;
}

const RELATIVE: Record<
  AppLang,
  {
    none: string;
    now: string;
    min: (n: string) => string;
    hr: (n: string, one: boolean) => string;
    day: (n: string, one: boolean) => string;
    noChanges: string;
  }
> = {
  en: {
    none: "no updates yet",
    now: "just now",
    min: (n) => `${n} min ago`,
    hr: (n, one) => `${n} hr${one ? "" : "s"} ago`,
    day: (n, one) => `${n} day${one ? "" : "s"} ago`,
    noChanges: "No changes recorded",
  },
  hi: {
    none: "अभी कोई अपडेट नहीं",
    now: "अभी अभी",
    min: (n) => `${n} मिनट पहले`,
    hr: (n) => `${n} घंटे पहले`,
    day: (n) => `${n} दिन पहले`,
    noChanges: "कोई बदलाव दर्ज नहीं",
  },
};

export function relativeStrings() {
  return RELATIVE[activeLang];
}

/** Kind/category labels used for documents. */
const KIND_LABELS: Record<AppLang, Record<string, string>> = {
  en: {},
  hi: {
    contract: "अनुबंध",
    invoice: "इनवॉइस",
    drawing: "ड्रॉइंग",
    report: "रिपोर्ट",
    permit: "अनुमति",
    other: "अन्य",
    "client upload": "क्लाइंट अपलोड",
  },
};

export function formatDocKind(kind: string | null | undefined): string {
  if (!kind) return "";
  return KIND_LABELS[activeLang][kind.toLowerCase()] ?? kind;
}

import { useEffect, useState } from "react";

/** Subscribe a component to language changes so formatters re-run. */
export function useLangTick(): AppLang {
  const [lang, setLang] = useState<AppLang>(getActiveLang());
  useEffect(() => onLangChange(setLang) as unknown as () => void, []);
  return lang;
}
