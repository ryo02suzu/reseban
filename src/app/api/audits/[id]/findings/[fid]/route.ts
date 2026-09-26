import { getRun, saveRun } from "@/lib/store";
import { handle, notFound } from "@/lib/api";
import { summarize } from "@/lib/rules/engine";
import type { FindingStatus } from "@/lib/types";

type Ctx = { params: Promise<{ id: string; fid: string }> };

export async function PATCH(request: Request, { params }: Ctx) {
  const { id, fid } = await params;
  const body = (await request.json()) as { status?: FindingStatus; memo?: string };
  return handle(() => {
    const run = getRun(id) ?? notFound("チェック結果");
    const f = run.findings.find((x) => x.id === fid) ?? notFound("指摘");
    if (body.status) {
      if (!["open", "fixed", "ignored"].includes(body.status)) throw new Error("状態が不正です");
      f.status = body.status;
    }
    if (typeof body.memo === "string") f.memo = body.memo.slice(0, 200);
    run.summary = summarize(run.findings, run.summary.receiptCount);
    saveRun(run);
    return { finding: f, summary: run.summary };
  });
}
