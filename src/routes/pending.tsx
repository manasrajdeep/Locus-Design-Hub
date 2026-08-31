import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Footer } from "@/components/Footer";
import { Loader2, Clock, LogOut } from "lucide-react";

export const Route = createFileRoute("/pending")({
  ssr: false,
  head: () => ({
    meta: [{ title: "Request Received — Locus Design" }, { name: "robots", content: "noindex" }],
  }),
  component: PendingPage,
});

function PendingPage() {
  const navigate = useNavigate();
  const [email, setEmail] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    supabase.auth.getUser().then(async ({ data }) => {
      if (!data.user) {
        navigate({ to: "/auth" });
        return;
      }
      // If a project has since been provisioned, route to portal.
      const { data: project } = await supabase
        .from("projects")
        .select("id")
        .eq("customer_id", data.user.id)
        .limit(1)
        .maybeSingle();
      if (project) {
        navigate({ to: "/portal" });
        return;
      }
      setEmail(data.user.email ?? null);
      setLoading(false);
    });
  }, [navigate]);

  const signOut = async () => {
    await supabase.auth.signOut();
    navigate({ to: "/" });
  };

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="flex min-h-screen flex-col bg-background">
      <header className="border-b border-border">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-6">
          <Link to="/" className="font-display text-xl tracking-tight text-foreground">
            Locus<span className="text-amber-brand">.</span>Design
          </Link>
          <button
            onClick={signOut}
            className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground"
          >
            <LogOut className="h-4 w-4" /> Sign out
          </button>
        </div>
      </header>

      <main className="flex flex-1 items-center justify-center px-4 py-16">
        <div className="w-full max-w-lg text-center">
          <div className="mx-auto inline-flex h-14 w-14 items-center justify-center rounded-full bg-amber-brand/10 text-amber-brand">
            <Clock className="h-6 w-6" />
          </div>
          <p className="eyebrow mt-6">Request received</p>
          <h1 className="mt-3 text-3xl md:text-4xl text-foreground">
            We're setting up your project profile.
          </h1>
          <p className="mt-4 text-muted-foreground leading-relaxed">
            We have received your request and are working on your project profile. Once it is ready,
            our technicians will let you know.
          </p>
          {email && (
            <p className="mt-6 text-xs text-muted-foreground">
              Signed in as <span className="text-foreground">{email}</span>
            </p>
          )}
        </div>
      </main>

      <Footer />
    </div>
  );
}
