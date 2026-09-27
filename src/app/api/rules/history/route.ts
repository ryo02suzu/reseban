import { fileBytes, handle, HttpError } from "@/lib/api";
import { actorOf, requireClinicApi } from "@/lib/auth";
import { logAction } from "@/lib/repo/core";
import { listClinicRules, saveClaimHistory } from "@/lib/repo/rules";
import { buildRanking, parseClaimHistory } from "@/lib/rules/ranking";

/** 返戻・査定の実績CSVを取り込む */
export async function POST(request: Request) {
  return handle(async () => {
    const s = await requireClinicApi(["owner"]);
    const form = await request.formData();
    const bytes = await fileBytes(form.get("file"), 5 * 1024 * 1024);
    if (!bytes) throw new HttpError(400, "CSVファイルを選んでください");
    const rows = parseClaimHistory(bytes);
    if (!rows.length) throw new HttpError(400, "読み取れる行がありませんでした。列は「年月,返戻/査定,項目名,事由,点数」です。");
    await saveClaimHistory(s.clinic.id, rows);
    await logAction(actorOf(s), "rule.history_import", "", { rows: rows.length });
    return { count: rows.length, ranking: buildRanking(rows, await listClinicRules(s.clinic.id)) };
  });
}
