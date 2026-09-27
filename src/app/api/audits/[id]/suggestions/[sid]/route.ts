import { handle, HttpError, notFound, readJson } from "@/lib/api";
import { actorOf, requireClinicApi } from "@/lib/auth";
import { logAction } from "@/lib/repo/core";
import { getRun, setSuggestions } from "@/lib/repo/runs";

type Ctx = { params: Promise<{ id: string; sid: string }> };

export async function PATCH(request: Request, { params }: Ctx) {
  const { id, sid } = await params;
  return handle(async () => {
    const s = await requireClinicApi();
    const { status } = await readJson<{ status?: "open" | "accepted" | "rejected" }>(request);
    if (!status || !["open", "accepted", "rejected"].includes(status)) throw new HttpError(400, "状態が不正です");
    const run = (await getRun(s.clinic.id, id)) ?? notFound("チェック結果");
    const sg = run.suggestions.find((x) => x.id === sid) ?? notFound("提案");
    sg.status = status;
    await setSuggestions(s.clinic.id, id, run.suggestions);
    await logAction(actorOf(s), "ai.suggestion_update", `${id}/${sid}`, { status });
    return { suggestion: sg };
  });
}
