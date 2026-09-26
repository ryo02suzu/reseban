import { getRules, saveClaimHistory } from "@/lib/store";
import { fileBytes, handle } from "@/lib/api";
import { buildRanking, parseClaimHistory } from "@/lib/rules/ranking";

/** 返戻・査定の実績CSVを取り込む */
export async function POST(request: Request) {
  return handle(async () => {
    const form = await request.formData();
    const bytes = await fileBytes(form.get("file"));
    if (!bytes) throw new Error("CSVファイルを選んでください");
    const rows = parseClaimHistory(bytes);
    if (!rows.length) throw new Error("読み取れる行がありませんでした。列は「年月,返戻/査定,項目名,事由,点数」です。");
    saveClaimHistory(rows);
    return { count: rows.length, ranking: buildRanking(rows, getRules()) };
  });
}
