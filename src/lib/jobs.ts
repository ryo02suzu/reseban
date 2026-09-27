import "server-only";
import { listClinics, logAction } from "./repo/core";
import { purgeOldReceipts, purgeOldRuns } from "./repo/runs";
import { purgeOldPaper } from "./repo/paper";
import { purgeExpiredSessions } from "./auth";
import { monthsBack } from "./rules/engine";

/** チェック結果（指摘・メモ）の保存期間（月）。レセプト本体より長く残す */
const RUN_RETENTION_MONTHS = Number(process.env.RUN_RETENTION_MONTHS ?? 36);

/** 保存期間を過ぎたレセプトとチェック結果、期限切れのセッションを消す */
export async function runRetention() {
  const now = new Date();
  const ym = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, "0")}`;
  for (const c of await listClinics()) {
    const receipts = await purgeOldReceipts(c.id, monthsBack(ym, c.retentionMonths));
    const paper = await purgeOldPaper(c.id, monthsBack(ym, c.retentionMonths));
    const cutoff = new Date(now);
    cutoff.setMonth(cutoff.getMonth() - RUN_RETENTION_MONTHS);
    const runs = await purgeOldRuns(c.id, cutoff);
    if (receipts || runs || paper) await logAction({ clinicId: c.id }, "retention.purge", "", { receiptMonths: receipts, paperReceipts: paper, runs });
  }
  await purgeExpiredSessions();
}
