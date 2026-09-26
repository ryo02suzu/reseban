import { connection } from "next/server";
import { CheckClient } from "@/components/CheckClient";
import { listRuns, listStoredMonths } from "@/lib/store";

export default async function CheckPage() {
  await connection();
  return (
    <>
      <div className="page-head">
        <div>
          <h1>チェック（取込）</h1>
          <p>レセ電ファイルを取り込み、点検を開始します。</p>
        </div>
      </div>
      <CheckClient runs={listRuns()} storedMonths={listStoredMonths()} />
    </>
  );
}
