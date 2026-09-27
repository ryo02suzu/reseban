import { AcceptForm } from "@/components/AuthForms";
import { findToken, getClinic } from "@/lib/repo/core";

export default async function InvitePage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const t = await findToken(token);
  if (!t) {
    return (
      <>
        <h1>リンクが無効です</h1>
        <p className="notice">有効期限が切れているか、すでに使われています。発行した人に再発行を依頼してください。</p>
      </>
    );
  }
  const clinic = t.clinicId ? await getClinic(t.clinicId) : null;
  return (
    <>
      <h1>{t.kind === "reset" ? "パスワードの再設定" : "アカウントの作成"}</h1>
      {t.kind === "invite" && (
        <p className="muted small" style={{ textAlign: "center", marginTop: -8 }}>
          {clinic ? `「${clinic.name}」に` : "運営者として"}招待されています（{t.role === "owner" ? "管理者" : t.role === "operator" ? "運営者" : "スタッフ"}）
        </p>
      )}
      <AcceptForm token={token} kind={t.kind} email={t.email} />
    </>
  );
}
