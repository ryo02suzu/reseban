import { redirect } from "next/navigation";
import { ADMIN_NAV, AppShell, CLINIC_NAV, ROLE_LABELS } from "@/components/AppShell";
import { getSession, TERMS_VERSION } from "@/lib/auth";

/** アカウント画面は、2段階認証の設定がまだでも開ける（設定するための画面なので） */
export default async function AccountLayout({ children }: { children: React.ReactNode }) {
  const s = await getSession();
  if (!s) redirect("/login");
  if (s.pending2fa) redirect("/login/2fa");
  if (s.user.termsVersion !== TERMS_VERSION) redirect("/account/terms");
  const nav = s.user.role === "operator" ? ADMIN_NAV : CLINIC_NAV(s.user.role === "owner");
  return (
    <AppShell nav={nav} title={s.clinic?.name ?? "運営コンソール"} userName={s.user.name} roleLabel={ROLE_LABELS[s.user.role]}>
      {children}
    </AppShell>
  );
}
