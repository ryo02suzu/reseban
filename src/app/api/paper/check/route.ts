import { handle, HttpError, readJson } from "@/lib/api";
import { actorOf, requireClinicApi } from "@/lib/auth";
import { runPaperAudit } from "@/lib/audit";
import { logAction } from "@/lib/repo/core";

/** 保存した紙レセプトで、その月をまとめてチェックする */
export async function POST(request: Request) {
  return handle(async () => {
    const s = await requireClinicApi();
    const { month } = await readJson<{ month?: string }>(request);
    if (!month || !/^\d{6}$/.test(month)) throw new HttpError(400, "診療年月を指定してください");
    const run = await runPaperAudit(s.clinic, month, s.user.id);
    await logAction(actorOf(s), "audit.run", run.id, { month, source: "paper", receipts: run.summary.receiptCount, findings: run.findings.length });
    return { id: run.id };
  });
}
