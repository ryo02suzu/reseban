import { redirect } from "next/navigation";
import { TermsAcceptForm } from "@/components/AuthForms";
import { getSession, TERMS_VERSION } from "@/lib/auth";

export default async function TermsAcceptPage() {
  const s = await getSession();
  if (!s) redirect("/login");
  if (s.user.termsVersion === TERMS_VERSION) redirect("/");
  return (
    <>
      <h1>利用規約の確認</h1>
      <p className="muted small">利用規約・プライバシーポリシーが更新されました。内容を確認のうえ、同意してください。</p>
      <TermsAcceptForm />
    </>
  );
}
