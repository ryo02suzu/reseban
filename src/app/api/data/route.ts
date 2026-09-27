import { eq } from "drizzle-orm";
import { forbidInDemo, handle, HttpError, readJson } from "@/lib/api";
import { actorOf, requireClinicApi } from "@/lib/auth";
import { getDb } from "@/lib/db";
import { claimHistory, clinicRuleSettings, monthReceipts, paperReceipts, rules, runs } from "@/lib/db/schema";
import { logAction } from "@/lib/repo/core";

/** 医院のレセプト（紙の入力を含む）・チェック結果・独自ルール・実績を全て削除（アカウントは残る） */
export async function DELETE(request: Request) {
  return handle(async () => {
    forbidInDemo();
    const s = await requireClinicApi(["owner"]);
    const { confirm } = await readJson<{ confirm?: string }>(request);
    if (confirm !== "削除") throw new HttpError(400, "確認のため「削除」と入力してください");
    const db = await getDb();
    await db.transaction(async (tx) => {
      await tx.delete(runs).where(eq(runs.clinicId, s.clinic.id));
      await tx.delete(monthReceipts).where(eq(monthReceipts.clinicId, s.clinic.id));
      await tx.delete(paperReceipts).where(eq(paperReceipts.clinicId, s.clinic.id));
      await tx.delete(rules).where(eq(rules.clinicId, s.clinic.id));
      await tx.delete(clinicRuleSettings).where(eq(clinicRuleSettings.clinicId, s.clinic.id));
      await tx.delete(claimHistory).where(eq(claimHistory.clinicId, s.clinic.id));
    });
    await logAction(actorOf(s), "data.delete_all");
  });
}
