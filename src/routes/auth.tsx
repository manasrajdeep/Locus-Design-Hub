import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { authProvider } from "@/integrations/auth";
import { Footer } from "@/components/Footer";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";

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
      { name: "description", content: "Sign in to your Locus Design client portal with Google." },
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
  const [loading, setLoading] = useState(false);
  const [checking, setChecking] = useState(true);

  useEffect(() => {
    supabase.auth.getSession().then(async ({ data }) => {
      if (data.session) {
        if (next) {
          window.location.replace(next);
          return;
        }
        const u = data.session.user;
        await routeAfterLogin(
          u.id,
          u.email ?? "",
          (u.user_metadata?.full_name as string) ?? null,
          navigate,
        );
      } else {
        setChecking(false);
      }
    });
  }, [navigate, next]);

  const signIn = async () => {
    setLoading(true);
    try {
      const result = await authProvider.auth.signInWithOAuth("google", {
        redirect_uri:
          window.location.origin + "/auth" + (next ? `?next=${encodeURIComponent(next)}` : ""),
      });
      if (result.error) throw result.error;
      if (result.redirected) return;
      // Session was set inline (popup flow) — proceed.
      const { data } = await supabase.auth.getUser();
      if (data.user) {
        if (next) {
          window.location.replace(next);
          return;
        }
        await routeAfterLogin(
          data.user.id,
          data.user.email ?? "",
          (data.user.user_metadata?.full_name as string) ?? null,
          navigate,
        );
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Sign-in failed";
      toast.error(msg);
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
            Sign in with Google to access your project timeline, documents, and team chat.
          </p>

          <button
            onClick={signIn}
            disabled={loading}
            className="mt-10 w-full inline-flex items-center justify-center gap-3 rounded-md border border-input bg-background px-4 py-3 text-sm font-medium text-foreground hover:bg-muted transition disabled:opacity-60"
          >
            {loading ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <svg viewBox="0 0 24 24" className="h-5 w-5" aria-hidden="true">
                <path
                  fill="#4285F4"
                  d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
                />
                <path
                  fill="#34A853"
                  d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
                />
                <path
                  fill="#FBBC05"
                  d="M5.84 14.1c-.22-.66-.35-1.36-.35-2.1s.13-1.44.35-2.1V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l3.66-2.84z"
                />
                <path
                  fill="#EA4335"
                  d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84C6.71 7.31 9.14 5.38 12 5.38z"
                />
              </svg>
            )}
            <span>Sign in with Google</span>
          </button>

          <p className="mt-8 text-xs text-muted-foreground">
            New clients: sign in and we'll set up your project profile.
          </p>
        </div>
      </main>

      <Footer />
    </div>
  );
}
