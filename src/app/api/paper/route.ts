import { forbidInDemo, handle, HttpError, readJson } from "@/lib/api";
import { actorOf, requireClinicApi } from "@/lib/auth";
import { logAction } from "@/lib/repo/core";
import { createPaper, listPaper, paperMonths } from "@/lib/repo/paper";
import { normalizePaper } from "@/lib/paper/types";

/** 紙レセプトの一覧（?month=YYYYMM）と、入力のある月 */
export async function GET(request: Request) {
  return handle(async () => {
    const s = await requireClinicApi();
    const month = new URL(request.url).searchParams.get("month") ?? "";
    if (!/^\d{6}$/.test(month)) throw new HttpError(400, "診療年月を指定してください");
    return { receipts: await listPaper(s.clinic.id, month), months: await paperMonths(s.clinic.id) };
  });
}

export async function POST(request: Request) {
  return handle(async () => {
    forbidInDemo();
    const s = await requireClinicApi();
    const { value, error } = normalizePaper(await readJson(request));
    if (!value) throw new HttpError(400, error!);
    const p = await createPaper(s.clinic.id, value, s.user.id);
    await logAction(actorOf(s), "paper.create", p.id, { month: p.month, no: p.no });
    return p;
  });
}
