import { fileBytes, forbidInDemo, handle, HttpError } from "@/lib/api";
import { actorOf, requireClinicApi } from "@/lib/auth";
import { logAction } from "@/lib/repo/core";
import { getClaimHistory, listClinicRules, saveClaimHistory } from "@/lib/repo/rules";
import { buildRanking, parseClaimHistory } from "@/lib/rules/ranking";

/** 返戻・査定の実績CSVを取り込む（今までの記録に追加。同じ内容の行は重ねない） */
export async function POST(request: Request) {
  return handle(async () => {
    forbidInDemo();
    const s = await requireClinicApi(["owner"]);
    const form = await request.formData();
    const bytes = await fileBytes(form.get("file"), 5 * 1024 * 1024);
    if (!bytes) throw new HttpError(400, "CSVファイルを選んでください");
    const rows = parseClaimHistory(bytes);
    if (!rows.length) throw new HttpError(400, "読み取れる行がありませんでした。列は「年月,返戻/査定,項目名,事由,点数」です。");
    const existing = await getClaimHistory(s.clinic.id);
    const key = (r: (typeof rows)[number]) => [r.month, r.kind, r.itemName, r.reason, r.points, r.patientId ?? ""].join("|");
    const seen = new Set(existing.map(key));
    const added = rows.filter((r) => !seen.has(key(r)) && seen.add(key(r)));
    const all = [...existing, ...added];
    await saveClaimHistory(s.clinic.id, all);
    await logAction(actorOf(s), "rule.history_import", "", { rows: added.length, skipped: rows.length - added.length });
    return { count: added.length, ranking: buildRanking(all, await listClinicRules(s.clinic.id)) };
  });
}
