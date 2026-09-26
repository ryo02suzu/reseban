import Link from "next/link";
import { redirect } from "next/navigation";
import { connection } from "next/server";
import { listRuns } from "@/lib/store";

/** サイドバーの「レポート」：最新のチェック結果を開く */
export default async function LatestReport() {
  await connection();
  const latest = listRuns()[0];
  if (latest) redirect(`/report/${latest.id}`);
  return (
    <>
      <div className="page-head">
        <h1>レポート</h1>
      </div>
      <div className="card empty">
        まだチェック結果がありません。<Link href="/">チェック（取込）</Link>からファイルを取り込んでください。
      </div>
    </>
  );
}
