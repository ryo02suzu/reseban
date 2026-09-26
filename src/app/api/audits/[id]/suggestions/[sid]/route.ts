import { getRun, saveRun } from "@/lib/store";
import { handle, notFound } from "@/lib/api";

type Ctx = { params: Promise<{ id: string; sid: string }> };

export async function PATCH(request: Request, { params }: Ctx) {
  const { id, sid } = await params;
  const { status } = (await request.json()) as { status: "open" | "accepted" | "rejected" };
  return handle(() => {
    if (!["open", "accepted", "rejected"].includes(status)) throw new Error("状態が不正です");
    const run = getRun(id) ?? notFound("チェック結果");
    const s = run.suggestions.find((x) => x.id === sid) ?? notFound("提案");
    s.status = status;
    saveRun(run);
    return { suggestion: s };
  });
}
