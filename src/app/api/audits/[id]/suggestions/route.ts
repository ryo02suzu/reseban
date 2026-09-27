import { randomUUID } from "node:crypto";
import { handle, HttpError, notFound } from "@/lib/api";
import { actorOf, requireClinicApi } from "@/lib/auth";
import { consumeAi, logAction } from "@/lib/repo/core";
import { getMonthReceipts, getRun, setSuggestions } from "@/lib/repo/runs";
import { suggestMissed } from "@/lib/ai/tasks";
import { getAiConfig } from "@/lib/ai/client";
import { facilityNameOf } from "@/lib/rules/facility";
import type { AiSuggestion } from "@/lib/types";

type Ctx = { params: Promise<{ id: string }> };

export async function POST(_: Request, { params }: Ctx) {
  const { id } = await params;
  return handle(async () => {
    const s = await requireClinicApi();
    if (!s.clinic.aiEnabled || !getAiConfig().provider) throw new HttpError(400, "AI機能がOFFです（設定画面）");
    const run = (await getRun(s.clinic.id, id)) ?? notFound("チェック結果");
    if (run.demo) throw new HttpError(400, "サンプルデータではAI提案は使えません");
    const receipts = (await getMonthReceipts(s.clinic.id, run.targetMonth)) ?? notFound("当月のレセプト");
    await consumeAi(s.clinic.id, s.clinic.aiMonthlyLimit);
    const result = await suggestMissed(receipts, s.clinic.facilityCodes.map(facilityNameOf));
    const suggestions: AiSuggestion[] = result.map((x) => ({
      id: randomUUID().slice(0, 8),
      karteNo: x.receipt.karteNo,
      receiptNo: x.receipt.receiptNo,
      itemName: x.itemName,
      estimatedPoints: x.estimatedPoints,
      rationale: x.rationale,
      status: "open",
    }));
    await setSuggestions(s.clinic.id, id, suggestions);
    await logAction(actorOf(s), "ai.suggest", id, { count: suggestions.length });
    return { suggestions };
  });
}
