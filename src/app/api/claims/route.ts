import { forbidInDemo, handle, HttpError, readJson } from "@/lib/api";
import { actorOf, requireClinicApi } from "@/lib/auth";
import { logAction } from "@/lib/repo/core";
import { addClaimHistoryRow, getClaimHistory } from "@/lib/repo/rules";

export async function GET() {
  return handle(async () => {
    const s = await requireClinicApi();
    return { rows: await getClaimHistory(s.clinic.id) };
  });
}

/** 返戻・査定を1件記録する（増減点連絡書・返戻付箋を見ながら） */
export async function POST(request: Request) {
  return handle(async () => {
    forbidInDemo();
    const s = await requireClinicApi();
    const b = await readJson<{ month?: string; kind?: string; itemName?: string; reason?: string; points?: number | string; patientId?: string }>(request);
    const month = String(b.month ?? "").replace(/\D/g, "");
    if (!/^20\d{2}(0[1-9]|1[0-2])$/.test(month)) throw new HttpError(400, "診療年月を正しく入れてください");
    if (b.kind !== "henrei" && b.kind !== "satei") throw new HttpError(400, "返戻か査定かを選んでください");
    const itemName = String(b.itemName ?? "").trim().slice(0, 100);
    if (!itemName) throw new HttpError(400, "項目名を入れてください");
    const points = Math.abs(Number(b.points) || 0);
    if (points > 1_000_000) throw new HttpError(400, "点数が大きすぎます");
    const row = await addClaimHistoryRow(s.clinic.id, {
      month,
      kind: b.kind,
      itemName,
      reason: String(b.reason ?? "").trim().slice(0, 200),
      points,
      ...(b.patientId?.trim() ? { patientId: b.patientId.trim().slice(0, 30) } : {}),
    });
    await logAction(actorOf(s), "claim.add", row.id, { month, kind: row.kind });
    return row;
  });
}
