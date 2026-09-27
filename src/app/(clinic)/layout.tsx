import { AppShell, CLINIC_NAV, ROLE_LABELS } from "@/components/AppShell";
import { requireClinicPage } from "@/lib/auth";

export default async function ClinicLayout({ children }: { children: React.ReactNode }) {
  const s = await requireClinicPage();
  return (
    <AppShell nav={CLINIC_NAV(s.user.role === "owner")} title={s.clinic.name} userName={s.user.name} roleLabel={ROLE_LABELS[s.user.role]}>
      {children}
    </AppShell>
  );
}
