import { randomUUID } from "node:crypto";
import { getMonthReceipts, getRun, getSettings, saveRun } from "@/lib/store";
import { handle, notFound } from "@/lib/api";
import { suggestMissed } from "@/lib/ai/tasks";

type Ctx = { params: Promise<{ id: string }> };

export async function POST(_: Request, { params }: Ctx) {
  const { id } = await params;
  return handle(async () => {
    const settings = getSettings();
    if (!settings.aiEnabled) throw new Error("設定画面でAI機能をONにしてください");
    const run = getRun(id) ?? notFound("チェック結果");
    if (run.demo) throw new Error("サンプルデータではAI提案は使えません。実データで試してください。");
    const receipts = getMonthReceipts(run.targetMonth) ?? notFound("当月のレセプト");
    const filed = settings.facilityStandards.filter((s) => s.filed).map((s) => s.name);
    const result = await suggestMissed(receipts, filed);
    run.suggestions = result.map((s) => ({
      id: randomUUID().slice(0, 8),
      karteNo: s.receipt.karteNo,
      receiptNo: s.receipt.receiptNo,
      itemName: s.itemName,
      estimatedPoints: s.estimatedPoints,
      rationale: s.rationale,
      status: "open",
    }));
    saveRun(run);
    return { suggestions: run.suggestions };
  });
}
