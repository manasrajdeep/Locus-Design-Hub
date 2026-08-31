import {
  createFileRoute,
  Outlet,
  redirect,
  Link,
  useNavigate,
  useRouterState,
} from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Footer } from "@/components/Footer";
import { LogOut, Loader2 } from "lucide-react";
import { ThemeToggleSolid } from "@/components/ThemeProvider";
import { LanguageToggle } from "@/components/LanguageProvider";
import type { Database } from "@/integrations/supabase/types";

type Role = Database["public"]["Enums"] extends { app_role: infer R }
  ? R
  : "customer" | "admin" | "superadmin";

export const Route = createFileRoute("/_authenticated")({
  ssr: false,
  beforeLoad: async () => {
    const { data, error } = await supabase.auth.getUser();
    if (error || !data.user) throw redirect({ to: "/auth" });
    return { user: data.user };
  },
  component: AuthedLayout,
});

function AuthedLayout() {
  const { user } = Route.useRouteContext();
  const [roles, setRoles] = useState<Role[] | null>(null);
  const navigate = useNavigate();
  const path = useRouterState({ select: (s) => s.location.pathname });

  useEffect(() => {
    supabase
      .from("user_roles")
      .select("role")
      .eq("user_id", user.id)
      .then(({ data }) => {
        setRoles((data ?? []).map((r) => r.role as Role));
      });
  }, [user.id]);

  // Staff areas are role-gated on top of the sign-in gate: a signed-in customer
  // who types /admin/... is sent back to their own portal, while the homepage
  // CMS and the backend diagnostics page are superadmin-only.
  //
  // This is a navigation gate, not the security boundary — RLS and the server
  // functions' own role checks are. It exists so the pages are not simply there
  // for anyone who guesses the URL.
  useEffect(() => {
    if (roles === null) return;
    const isStaff = roles.includes("admin" as Role) || roles.includes("superadmin" as Role);
    const isSuperadmin = roles.includes("superadmin" as Role);
    if (path.startsWith("/admin") && !isStaff) {
      navigate({ to: "/portal", replace: true });
      return;
    }
    if (path.startsWith("/admin/homepage") && !isSuperadmin) {
      navigate({ to: "/admin/dashboard", replace: true });
      return;
    }
    if (path.startsWith("/diagnostics") && !isSuperadmin) {
      navigate({ to: isStaff ? "/admin/dashboard" : "/portal", replace: true });
    }
  }, [roles, path, navigate]);

  const signOut = async () => {
    await supabase.auth.signOut();
    navigate({ to: "/" });
  };

  if (roles === null) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  // The client portal is a personal profile: it renders its own minimal header
  // and no site/staff navigation.
  if (path.startsWith("/portal")) {
    return (
      <div className="flex min-h-screen flex-col bg-background">
        <main className="flex-1">
          <Outlet />
        </main>
        <Footer />
      </div>
    );
  }

  return (
    <div className="flex min-h-screen flex-col bg-background">
      <header className="sticky top-0 z-40 border-b border-border bg-background/95 backdrop-blur">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-4 py-3 md:px-6">
          <Link to="/" className="font-display text-lg tracking-tight text-foreground">
            Locus<span className="text-amber-brand">.</span>Design
          </Link>
          <nav className="flex items-center gap-2">
            <ThemeToggleSolid />
            <LanguageToggle className="border-border !text-foreground hover:bg-muted" />
            <button
              onClick={signOut}
              className="ml-2 inline-flex items-center gap-2 rounded-md px-3 py-1.5 text-sm text-muted-foreground hover:bg-muted hover:text-foreground transition"
            >
              <LogOut className="h-4 w-4" />
              <span className="hidden sm:inline">Sign out</span>
            </button>
          </nav>
        </div>
      </header>

      <main className="flex-1">
        <Outlet />
      </main>

      <Footer />
    </div>
  );
}
