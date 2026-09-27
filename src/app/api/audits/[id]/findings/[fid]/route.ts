import { handle, HttpError, notFound, readJson } from "@/lib/api";
import { actorOf, requireClinicApi } from "@/lib/auth";
import { logAction } from "@/lib/repo/core";
import { updateFinding } from "@/lib/repo/runs";
import type { FindingStatus } from "@/lib/types";

type Ctx = { params: Promise<{ id: string; fid: string }> };

export async function PATCH(request: Request, { params }: Ctx) {
  const { id, fid } = await params;
  return handle(async () => {
    const s = await requireClinicApi();
    const body = await readJson<{ status?: FindingStatus; memo?: string }>(request);
    if (body.status && !["open", "fixed", "ignored"].includes(body.status)) throw new HttpError(400, "状態が不正です");
    const patch = { status: body.status, memo: typeof body.memo === "string" ? body.memo.slice(0, 200) : undefined };
    const res = (await updateFinding(s.clinic.id, id, fid, patch, s.user.id)) ?? notFound("指摘");
    await logAction(actorOf(s), "finding.update", `${id}/${fid}`, { status: body.status, memo: patch.memo !== undefined });
    return res;
  });
}
