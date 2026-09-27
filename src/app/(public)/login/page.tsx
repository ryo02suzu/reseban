import { redirect } from "next/navigation";
import { LoginForm } from "@/components/AuthForms";
import { getSession } from "@/lib/auth";
import { countUsers } from "@/lib/repo/core";

export default async function LoginPage() {
  const s = await getSession();
  if (s && !s.pending2fa) redirect(s.user.role === "operator" ? "/admin" : "/");
  const noUsers = (await countUsers()) === 0;
  return (
    <>
      <h1>ログイン</h1>
      {noUsers && (
        <p className="notice info">
          まだアカウントがありません。サーバーで <code>node scripts/create-operator.mjs you@example.com</code> を実行し、表示された招待リンクから運営者アカウントを作成してください。
        </p>
      )}
      <LoginForm />
    </>
  );
}
