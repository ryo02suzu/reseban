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
    // 1か月分が社保・国保やマルチボリュームで複数ファイルに分かれることがある
    const read = async (name: string, max: number) => {
      const entries = form.getAll(name);
      if (entries.length > max) throw new HttpError(400, `ファイルが多すぎます（${max}ファイルまで）`);
      const out: Uint8Array[] = [];
      for (const v of entries) {
        const b = await fileBytes(v, MAX_UPLOAD_BYTES);
        if (b) out.push(b);
      }
      return out;
    };
    const current = await read("current", 10);
    if (!current.length) throw new HttpError(400, "当月のファイルを選んでください");
    const history = await read("history", 40);
    const run = await runAudit(s.clinic, { current, history }, s.user.id);
    await logAction(actorOf(s), "audit.run", run.id, {
      month: run.targetMonth,
      receipts: run.summary.receiptCount,
      findings: run.findings.length,
      currentFiles: current.length,
      historyFiles: history.length,
    });
    return { id: run.id };
  });
}
