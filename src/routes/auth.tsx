import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { authProvider } from "@/integrations/auth";
import { Footer } from "@/components/Footer";
import { toast } from "sonner";
import { Loader2, Mail, MailCheck } from "lucide-react";

export const Route = createFileRoute("/auth")({
  validateSearch: (s: Record<string, unknown>): { next?: string } => ({
    // Same-origin relative path to return to after sign-in (used by the OAuth consent flow).
    next:
      typeof s.next === "string" && s.next.startsWith("/") && !s.next.startsWith("//")
        ? s.next
        : undefined,
  }),
  head: () => ({
    meta: [
      { title: "Client Login — Locus Design" },
      {
        name: "description",
        content: "Sign in to your Locus Design client portal with a link sent to your email.",
      },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: AuthPage,
});

async function routeAfterLogin(
  userId: string,
  email: string,
  fullName: string | null,
  navigate: (opts: { to: string }) => void,
) {
  const { data: project } = await supabase
    .from("projects")
    .select("id")
    .eq("customer_id", userId)
    .limit(1)
    .maybeSingle();

  if (project) {
    navigate({ to: "/portal" });
    return;
  }

  // No project — record access request (idempotent via unique(user_id)).
  await supabase
    .from("access_requests")
    .upsert(
      { user_id: userId, email, full_name: fullName, status: "pending" },
      { onConflict: "user_id", ignoreDuplicates: true },
    );
  navigate({ to: "/pending" });
}

function AuthPage() {
  const navigate = useNavigate();
  const { next } = Route.useSearch();
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);
  const [checking, setChecking] = useState(true);

  useEffect(() => {
    // Returning from a magic link: the client picks the session out of the URL
    // itself, so keep the spinner up rather than flashing the form first.
    const url = typeof window !== "undefined" ? window.location : undefined;
    const returning = !!url && (url.hash.includes("access_token") || url.search.includes("code="));

    // An expired or already-used link comes back as an error in the fragment.
    if (url?.hash.includes("error")) {
      const reason = new URLSearchParams(url.hash.slice(1)).get("error_description");
      toast.error(reason ?? "That sign-in link is no longer valid. Request a new one.");
      history.replaceState(null, "", url.pathname + url.search);
      setChecking(false);
    }

    let handled = false;
    const enter = async (
      session: {
        user: { id: string; email?: string; user_metadata?: Record<string, unknown> };
      } | null,
    ) => {
      if (handled || !session) return;
      handled = true;
      if (next) {
        window.location.replace(next);
        return;
      }
      const u = session.user;
      await routeAfterLogin(
        u.id,
        u.email ?? "",
        (u.user_metadata?.full_name as string) ?? null,
        navigate,
      );
    };

    // Both paths matter: an existing session resolves through getSession, while
    // a session recovered from the URL only ever arrives as an auth state change.
    const { data: sub } = supabase.auth.onAuthStateChange((_event, session) => {
      void enter(session);
    });

    supabase.auth.getSession().then(({ data }) => {
      if (data.session) void enter(data.session);
      else if (!returning) setChecking(false);
    });

    return () => sub.subscription.unsubscribe();
  }, [navigate, next]);

  const sendLink = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email.trim()) return;
    setLoading(true);
    try {
      const { error } = await authProvider.auth.signInWithMagicLink(email, {
        redirectTo:
          window.location.origin + "/auth" + (next ? `?next=${encodeURIComponent(next)}` : ""),
      });
      if (error) throw error;
      setSent(true);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not send the sign-in link");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex min-h-screen flex-col bg-background">
      <header className="border-b border-border">
        <div className="mx-auto max-w-6xl px-6 py-6">
          <Link to="/" className="font-display text-xl tracking-tight text-foreground">
            Locus<span className="text-amber-brand">.</span>Design
          </Link>
        </div>
      </header>

      <main className="flex flex-1 items-center justify-center px-4 py-16">
        <div
          className={`w-full max-w-md text-center ${checking ? "pointer-events-none opacity-60" : ""}`}
        >
          <p className="eyebrow">Client Portal</p>
          <h1 className="mt-3 text-4xl text-foreground">Welcome.</h1>
          <p className="mt-3 text-sm text-muted-foreground">
            {sent
              ? "Check your inbox — the link signs you straight in."
              : "Enter your email and we'll send you a link to access your project timeline, documents, and team chat."}
          </p>

          {sent ? (
            <div className="mt-10 flex flex-col items-center gap-3 rounded-md border border-input bg-muted/40 px-4 py-8">
              <MailCheck className="h-8 w-8 text-amber-brand" aria-hidden="true" />
              <p className="text-sm font-medium text-foreground">Link sent to {email}</p>
              <p className="text-xs text-muted-foreground">
                It expires shortly. Didn't arrive? Check spam, or{" "}
                <button
                  type="button"
                  onClick={() => setSent(false)}
                  className="underline underline-offset-2 hover:text-foreground"
                >
                  try another address
                </button>
                .
              </p>
            </div>
          ) : (
            <form onSubmit={sendLink} className="mt-10 space-y-3 text-left">
              <label htmlFor="email" className="sr-only">
                Email address
              </label>
              <input
                id="email"
                type="email"
                required
                autoComplete="email"
                autoFocus
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@company.com"
                className="w-full rounded-md border border-input bg-background px-4 py-3 text-sm text-foreground placeholder:text-muted-foreground focus:border-amber-brand focus:outline-none"
              />
              <button
                type="submit"
                disabled={loading}
                className="w-full inline-flex items-center justify-center gap-3 rounded-md border border-input bg-background px-4 py-3 text-sm font-medium text-foreground hover:bg-muted transition disabled:opacity-60"
              >
                {loading ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Mail className="h-4 w-4" aria-hidden="true" />
                )}
                <span>Email me a sign-in link</span>
              </button>
            </form>
          )}

          <p className="mt-8 text-xs text-muted-foreground">
            New clients: sign in and we'll set up your project profile.
          </p>
        </div>
      </main>

      <Footer />
    </div>
  );
}
