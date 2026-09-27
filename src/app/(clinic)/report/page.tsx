import Link from "next/link";
import { redirect } from "next/navigation";
import { requireClinicPage } from "@/lib/auth";
import { listRuns } from "@/lib/repo/runs";

/** サイドバーの「レポート」：最新のチェック結果を開く */
export default async function LatestReport() {
  const s = await requireClinicPage();
  const latest = (await listRuns(s.clinic.id))[0];
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
