import { handle, HttpError, notFound } from "@/lib/api";
import { actorOf, requireClinicApi } from "@/lib/auth";
import { consumeAi, logAction } from "@/lib/repo/core";
import { getFinding, updateFinding } from "@/lib/repo/runs";
import { explainFinding } from "@/lib/ai/tasks";
import { getAiConfig } from "@/lib/ai/client";

type Ctx = { params: Promise<{ id: string; fid: string }> };

export async function POST(_: Request, { params }: Ctx) {
  const { id, fid } = await params;
  return handle(async () => {
    const s = await requireClinicApi();
    if (!s.clinic.aiEnabled || !getAiConfig().provider) throw new HttpError(400, "AI機能がOFFです（設定画面）");
    const f = (await getFinding(s.clinic.id, id, fid)) ?? notFound("指摘");
    await consumeAi(s.clinic.id, s.clinic.aiMonthlyLimit);
    const aiExplanation = await explainFinding(f);
    await updateFinding(s.clinic.id, id, fid, { aiExplanation }, s.user.id);
    await logAction(actorOf(s), "ai.explain", `${id}/${fid}`);
    return { aiExplanation };
  });
}
