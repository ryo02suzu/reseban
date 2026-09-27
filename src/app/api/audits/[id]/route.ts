import { handle, notFound } from "@/lib/api";
import { actorOf, requireClinicApi } from "@/lib/auth";
import { logAction } from "@/lib/repo/core";
import { deleteRun, getRun } from "@/lib/repo/runs";

type Ctx = { params: Promise<{ id: string }> };

export async function DELETE(_: Request, { params }: Ctx) {
  const { id } = await params;
  return handle(async () => {
    const s = await requireClinicApi(["owner"]);
    if (!(await getRun(s.clinic.id, id))) notFound("チェック結果");
    await deleteRun(s.clinic.id, id);
    await logAction(actorOf(s), "audit.delete", id);
  });
}
