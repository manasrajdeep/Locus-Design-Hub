import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import { hindiPhrases, toHindi } from "@/lib/hindi-dictionary";
import { setActiveLang } from "@/lib/i18n-format";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

type Lang = "en" | "hi";
type Ctx = {
  lang: Lang;
  toggle: () => void;
  setLang: (l: Lang) => void;
  t: (key: string) => string;
};

// Short keys kept for explicit t() usage in components.
const keyed: Record<string, string> = {
  services: "Services",
  engineering: "Engineering",
  portfolio: "Portfolio",
  contact: "Contact",
  clientLogin: "Client Login",
  openPortal: "Open Portal",
};

const LanguageContext = createContext<Ctx>({
  lang: "en",
  toggle: () => {},
  setLang: () => {},
  t: (key) => keyed[key] ?? key,
});

/* ---------------- DOM-wide translation engine ---------------- */

const SKIP_TAGS = new Set(["SCRIPT", "STYLE", "NOSCRIPT", "CODE", "PRE", "SVG", "TEXTAREA"]);
const originals = new WeakMap<Node, { orig: string; tr: string }>();
const ATTRS = ["placeholder", "title", "aria-label", "alt"] as const;

function skipped(node: Node | null): boolean {
  let el: HTMLElement | null =
    node && node.nodeType === Node.TEXT_NODE ? node.parentElement : (node as HTMLElement | null);
  while (el) {
    if (SKIP_TAGS.has(el.tagName)) return true;
    if (el.hasAttribute?.("data-no-translate")) return true;
    el = el.parentElement;
  }
  return false;
}

function applyTextNodes(root: Node, lang: Lang) {
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  const nodes: Text[] = [];
  let current = walker.nextNode();
  while (current) {
    nodes.push(current as Text);
    current = walker.nextNode();
  }
  if (root.nodeType === Node.TEXT_NODE) nodes.push(root as Text);

  for (const node of nodes) {
    const value = node.nodeValue ?? "";
    if (!value.trim() || skipped(node)) continue;
    if (lang === "hi") {
      const tracked = originals.get(node);
      const original = tracked && tracked.tr === value ? tracked.orig : value;
      const next = toHindi(original);
      if (next !== value) {
        originals.set(node, { orig: original, tr: next });
        node.nodeValue = next;
      }
    } else {
      const tracked = originals.get(node);
      // Only undo our own edits: nodes React re-rendered (e.g. t() output) are left alone.
      if (tracked && tracked.tr === value && tracked.orig !== value) {
        node.nodeValue = tracked.orig;
        originals.delete(node);
      }
    }
  }
}

function applyAttributes(root: Node, lang: Lang) {
  const scope = root.nodeType === Node.ELEMENT_NODE ? (root as HTMLElement) : document.body;
  if (!scope) return;
  const selector = ATTRS.map((a) => `[${a}]`).join(",");
  const list: HTMLElement[] = [];
  if (scope.matches?.(selector)) list.push(scope);
  scope.querySelectorAll?.<HTMLElement>(selector).forEach((el) => list.push(el));

  for (const el of list) {
    if (skipped(el)) continue;
    for (const attr of ATTRS) {
      const value = el.getAttribute(attr);
      if (!value || !value.trim()) continue;
      const store = `data-i18n-${attr}`;
      if (lang === "hi") {
        const original = el.getAttribute(store) ?? value;
        const next = toHindi(original);
        if (next !== value) {
          el.setAttribute(store, original);
          el.setAttribute(attr, next);
        }
      } else {
        const original = el.getAttribute(store);
        if (original !== null) {
          el.setAttribute(attr, original);
          el.removeAttribute(store);
        }
      }
    }
  }
}

function translateTree(root: Node, lang: Lang) {
  applyTextNodes(root, lang);
  applyAttributes(root, lang);
}

/* ------------------------------------------------------------- */

/** True when the browser/OS language list asks for Hindi. */
function prefersHindi(): boolean {
  if (typeof navigator === "undefined") return false;
  const tags = [...(navigator.languages ?? []), navigator.language].filter(Boolean) as string[];
  return tags.some((tag) => /^hi\b/i.test(tag.trim()));
}

export function LanguageProvider({ children }: { children: ReactNode }) {
  const [lang, setLangState] = useState<Lang>("en");
  const userToggled = useRef(false);

  // Local preference first (instant, works signed out), then the browser's own
  // language on a first visit, then the saved profile preference for signed-in users.
  useEffect(() => {
    const stored = (typeof window !== "undefined" && localStorage.getItem("lang")) as Lang | null;
    if (!userToggled.current) {
      if (stored === "en" || stored === "hi") {
        setLangState(stored);
      } else if (prefersHindi()) {
        setLangState("hi");
      }
    }

    let cancelled = false;
    (async () => {
      try {
        const { data } = await supabase.auth.getUser();
        if (!data.user || cancelled) return;
        const { data: profile } = await supabase
          .from("profiles")
          .select("language")
          .eq("id", data.user.id)
          .maybeSingle();
        const remote = profile?.language as Lang | undefined;
        if (!cancelled && !userToggled.current && (remote === "en" || remote === "hi")) {
          setLangState(remote);
        }
      } catch {
        /* offline / not signed in — local preference stands */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    setActiveLang(lang);
    if (typeof document === "undefined") return;
    document.documentElement.lang = lang;
    try {
      localStorage.setItem("lang", lang);
    } catch {
      /* noop */
    }
  }, [lang]);

  const setLang = (next: Lang, notify = false) => {
    userToggled.current = true;
    setLangState(next);
    if (notify) {
      // Written in the target language so the confirmation matches the new UI.
      const title = next === "hi" ? "भाषा हिंदी में बदल दी गई" : "Language switched to English";
      const description =
        next === "hi" ? "पूरी साइट अब हिंदी में है।" : "The whole site is now in English.";
      toast.success(title, { description });
    }
    // Remember the choice for the next sign-in.
    void (async () => {
      try {
        const { data } = await supabase.auth.getUser();
        if (!data.user) return;
        await supabase.from("profiles").update({ language: next }).eq("id", data.user.id);
      } catch {
        /* preference stays local */
      }
    })();
  };

  // Translate the whole rendered page (and anything React renders later).
  useEffect(() => {
    if (typeof document === "undefined" || !document.body) return;
    let frame = 0;
    const run = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => translateTree(document.body, lang));
    };
    run();

    const observer = new MutationObserver((records) => {
      if (lang === "en") return;
      for (const record of records) {
        if (record.type === "characterData" && record.target.nodeValue) {
          const stored = originals.get(record.target);
          if (stored && stored.tr === record.target.nodeValue) continue;
          originals.delete(record.target);
        }
      }
      run();
    });
    observer.observe(document.body, {
      childList: true,
      subtree: true,
      characterData: true,
      attributes: true,
      attributeFilter: [...ATTRS],
    });

    return () => {
      observer.disconnect();
      cancelAnimationFrame(frame);
    };
  }, [lang]);

  const toggle = () => {
    setLang(lang === "en" ? "hi" : "en", true);
  };

  const t = (key: string) => {
    const english = keyed[key] ?? key;
    return lang === "hi" ? (hindiPhrases[english] ?? toHindi(english)) : english;
  };

  return (
    <LanguageContext.Provider value={{ lang, toggle, setLang, t }}>
      {children}
    </LanguageContext.Provider>
  );
}

export const useLanguage = () => useContext(LanguageContext);

export function LanguageToggle({ className = "" }: { className?: string }) {
  const { lang, toggle } = useLanguage();
  return (
    <button
      data-no-translate
      onClick={toggle}
      aria-label={lang === "en" ? "Switch to Hindi" : "Switch to English"}
      className={`inline-flex h-9 w-9 items-center justify-center rounded-full border border-white/20 text-xs font-semibold text-white/90 hover:bg-white/10 transition ${className}`}
      title={lang === "en" ? "Switch to Hindi" : "Switch to English"}
    >
      {lang === "en" ? "HI" : "EN"}
    </button>
  );
}
