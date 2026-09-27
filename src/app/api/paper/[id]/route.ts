import { forbidInDemo, handle, HttpError, notFound, readJson } from "@/lib/api";
import { actorOf, requireClinicApi } from "@/lib/auth";
import { logAction } from "@/lib/repo/core";
import { deletePaper, updatePaper } from "@/lib/repo/paper";
import { normalizePaper } from "@/lib/paper/types";

type Ctx = { params: Promise<{ id: string }> };

export async function PUT(request: Request, { params }: Ctx) {
  const { id } = await params;
  return handle(async () => {
    forbidInDemo();
    const s = await requireClinicApi();
    const { value, error } = normalizePaper(await readJson(request));
    if (!value) throw new HttpError(400, error!);
    const p = (await updatePaper(s.clinic.id, id, value)) ?? notFound("紙レセプト");
    await logAction(actorOf(s), "paper.update", p.id, { month: p.month, no: p.no });
    return p;
  });
}

export async function DELETE(_: Request, { params }: Ctx) {
  const { id } = await params;
  return handle(async () => {
    forbidInDemo();
    const s = await requireClinicApi();
    if (!(await deletePaper(s.clinic.id, id))) notFound("紙レセプト");
    await logAction(actorOf(s), "paper.delete", id);
  });
}
