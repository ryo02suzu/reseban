import { handle, HttpError, readJson } from "@/lib/api";
import { requireClinicApi } from "@/lib/auth";
import { previewPaper } from "@/lib/audit";
import { normalizePaper } from "@/lib/paper/types";

/** 入力中の紙レセプト1枚を、保存せずにチェックする */
export async function POST(request: Request) {
  return handle(async () => {
    const s = await requireClinicApi();
    const { value, error } = normalizePaper(await readJson(request));
    if (!value) throw new HttpError(400, error!);
    return previewPaper(s.clinic, value);
  });
}
