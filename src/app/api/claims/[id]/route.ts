import { forbidInDemo, handle, notFound } from "@/lib/api";
import { actorOf, requireClinicApi } from "@/lib/auth";
import { logAction } from "@/lib/repo/core";
import { deleteClaimHistoryRow } from "@/lib/repo/rules";

type Ctx = { params: Promise<{ id: string }> };

export async function DELETE(_: Request, { params }: Ctx) {
  const { id } = await params;
  return handle(async () => {
    forbidInDemo();
    const s = await requireClinicApi();
    if (!(await deleteClaimHistoryRow(s.clinic.id, id))) notFound("記録");
    await logAction(actorOf(s), "claim.delete", id);
  });
}
