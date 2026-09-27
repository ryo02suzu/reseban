import { runAudit, MAX_UPLOAD_BYTES } from "@/lib/audit";
import { fileBytes, handle, HttpError } from "@/lib/api";
import { actorOf, requireClinicApi } from "@/lib/auth";
import { logAction } from "@/lib/repo/core";
import { DEMO_MODE } from "@/lib/demo/mode";

export async function POST(request: Request) {
  return handle(async () => {
    const s = await requireClinicApi();
    if (DEMO_MODE) throw new HttpError(400, "デモ環境では実際のレセ電は取り込めません。「サンプルデータで試す」をお使いください。");
    const form = await request.formData();
    const current = await fileBytes(form.get("current"), MAX_UPLOAD_BYTES);
    if (!current) throw new HttpError(400, "当月のファイルを選んでください");
    const history: Uint8Array[] = [];
    const entries = form.getAll("history");
    if (entries.length > 12) throw new HttpError(400, "過去分は12ファイルまでです");
    for (const v of entries) {
      const b = await fileBytes(v, MAX_UPLOAD_BYTES);
      if (b) history.push(b);
    }
    const run = await runAudit(s.clinic, { current, history }, s.user.id);
    await logAction(actorOf(s), "audit.run", run.id, {
      month: run.targetMonth,
      receipts: run.summary.receiptCount,
      findings: run.findings.length,
      historyFiles: history.length,
    });
    return { id: run.id };
  });
}
