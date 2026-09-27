import { CheckClient } from "@/components/CheckClient";
import { requireClinicPage } from "@/lib/auth";
import { listRuns, listStoredMonths } from "@/lib/repo/runs";

export default async function CheckPage() {
  const s = await requireClinicPage();
  const [runs, months] = await Promise.all([listRuns(s.clinic.id), listStoredMonths(s.clinic.id)]);
  return (
    <>
      <div className="page-head">
        <div>
          <h1>チェック（取込）</h1>
          <p>レセ電ファイルを取り込み、点検を開始します。</p>
        </div>
      </div>
      <CheckClient runs={runs} storedMonths={months} canDelete={s.user.role === "owner"} />
    </>
  );
}
