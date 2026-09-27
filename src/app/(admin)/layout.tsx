import { ADMIN_NAV, AppShell, ROLE_LABELS } from "@/components/AppShell";
import { requirePageUser } from "@/lib/auth";

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const s = await requirePageUser(["operator"]);
  return (
    <AppShell nav={ADMIN_NAV} title="運営コンソール" userName={s.user.name} roleLabel={ROLE_LABELS[s.user.role]}>
      {children}
    </AppShell>
  );
}
