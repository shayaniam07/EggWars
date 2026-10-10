import AdminLogin from "@/components/admin/AdminLogin";
import AdminPanel from "@/components/admin/AdminPanel";
import { getSessionUser } from "@/lib/auth";
import { ensureSeeded } from "@/lib/bootstrap";

export const dynamic = "force-dynamic";

/**
 * Admin route. Access is gated here *and* re-checked on every
 * /api/admin/* request, so hiding the UI is never the only protection.
 */
export default async function AdminPage() {
  await ensureSeeded().catch(() => {});
  const user = await getSessionUser();
  if (!user || (user.role !== "admin" && user.role !== "moderator")) {
    return <AdminLogin signedInAs={user?.displayName ?? null} />;
  }
  return <AdminPanel initialName={user.displayName} />;
}
