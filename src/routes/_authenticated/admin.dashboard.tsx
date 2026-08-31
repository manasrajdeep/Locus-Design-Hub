import { createFileRoute } from "@tanstack/react-router";
import { AdminDashboard } from "@/components/AdminDashboard";

export const Route = createFileRoute("/_authenticated/admin/dashboard")({
  head: () => ({
    meta: [{ title: "Admin — Locus Design" }, { name: "robots", content: "noindex" }],
  }),
  component: AdminDashboardPage,
});

function AdminDashboardPage() {
  const { user } = Route.useRouteContext();
  return <AdminDashboard userId={user.id} projectHrefPrefix="/admin" />;
}
