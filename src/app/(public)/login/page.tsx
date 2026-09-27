import { redirect } from "next/navigation";
import { LoginForm } from "@/components/AuthForms";
import { getSession } from "@/lib/auth";
import { countUsers } from "@/lib/repo/core";
import { DEMO_ACCOUNTS, DEMO_MODE } from "@/lib/demo/mode";

export default async function LoginPage() {
  const s = await getSession();
  if (s && !s.pending2fa) redirect(s.user.role === "operator" ? "/admin" : "/");
  const noUsers = (await countUsers()) === 0;
  return (
    <>
      <h1>ログイン</h1>
      {DEMO_MODE && (
        <div className="notice info">
          <p style={{ margin: "0 0 6px" }}>
            <strong>デモ環境です。</strong>架空のデータだけで動きます。実際のレセ電は取り込めません。データはときどき初期状態に戻ります。
          </p>
          <ul style={{ margin: 0, paddingLeft: 18 }}>
            <li>医院の管理者：{DEMO_ACCOUNTS.owner.email}</li>
            <li>医院のスタッフ：{DEMO_ACCOUNTS.staff.email}</li>
            <li>運営者：{DEMO_ACCOUNTS.operator.email}</li>
          </ul>
          <p style={{ margin: "6px 0 0" }}>パスワードはどれも {DEMO_ACCOUNTS.owner.password}</p>
        </div>
      )}
      {noUsers && (
        <p className="notice info">
          まだアカウントがありません。サーバーで <code>node scripts/create-operator.mjs you@example.com</code> を実行し、表示された招待リンクから運営者アカウントを作成してください。
        </p>
      )}
      <LoginForm />
    </>
  );
}
