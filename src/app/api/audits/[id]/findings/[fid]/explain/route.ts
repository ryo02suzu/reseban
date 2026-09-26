import { getRun, getSettings, saveRun } from "@/lib/store";
import { handle, notFound } from "@/lib/api";
import { explainFinding } from "@/lib/ai/tasks";

type Ctx = { params: Promise<{ id: string; fid: string }> };

export async function POST(_: Request, { params }: Ctx) {
  const { id, fid } = await params;
  return handle(async () => {
    if (!getSettings().aiEnabled) throw new Error("設定画面でAI機能をONにしてください");
    const run = getRun(id) ?? notFound("チェック結果");
    const f = run.findings.find((x) => x.id === fid) ?? notFound("指摘");
    f.aiExplanation = await explainFinding(f);
    saveRun(run);
    return { aiExplanation: f.aiExplanation };
  });
}
