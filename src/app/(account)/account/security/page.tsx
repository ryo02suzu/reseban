import { redirect } from "next/navigation";
import { SecurityClient } from "@/components/SecurityClient";
import { getSession } from "@/lib/auth";

export default async function SecurityPage({ searchParams }: { searchParams: Promise<{ setup?: string }> }) {
  const s = await getSession();
  if (!s) redirect("/login");
  const { setup } = await searchParams;
  return (
    <>
      <div className="page-head">
        <div>
          <h1>パスワード・2段階認証</h1>
          <p>{s.user.email}</p>
        </div>
      </div>
      {(setup || s.needs2faSetup) && !s.user.totpEnabled && (
        <p className="notice" style={{ marginBottom: 16 }}>
          {s.user.role === "operator" ? "運営者アカウント" : "この医院"}では2段階認証が必須です。下の手順で設定すると、ほかの画面が使えるようになります。
        </p>
      )}
      <SecurityClient
        totpEnabled={s.user.totpEnabled}
        canDisable={!s.needs2faSetup && s.user.role !== "operator" && !s.clinic?.require2fa}
        home={s.user.role === "operator" ? "/admin" : "/"}
      />
    </>
  );
}
