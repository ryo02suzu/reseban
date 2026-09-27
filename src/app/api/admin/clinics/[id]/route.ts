import { handle, HttpError, notFound, readJson } from "@/lib/api";
import { actorOf, requireApiUser } from "@/lib/auth";
import { createToken, getClinic, getUserByEmail, logAction, updateClinic } from "@/lib/repo/core";

type Ctx = { params: Promise<{ id: string }> };

/** 利用停止・再開、AI上限、メモ、院長の招待リンク再発行 */
export async function PATCH(request: Request, { params }: Ctx) {
  const { id } = await params;
  return handle(async () => {
    const s = await requireApiUser(["operator"]);
    const clinic = (await getClinic(id)) ?? notFound("医院");
    const b = await readJson<{ status?: "active" | "suspended"; aiMonthlyLimit?: number; note?: string; name?: string; inviteOwner?: string }>(request);
    if (b.inviteOwner !== undefined) {
      const email = b.inviteOwner.trim().toLowerCase();
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new HttpError(400, "メールアドレスを正しく入力してください");
      if (await getUserByEmail(email)) throw new HttpError(409, "このメールアドレスはすでに登録されています");
      const token = await createToken({ kind: "invite", clinicId: clinic.id, role: "owner", email, createdBy: s.user.id, hours: 24 * 7 });
      await logAction(actorOf(s), "invite.create", email, { clinicId: clinic.id, role: "owner" });
      return { path: `/invite/${token}` };
    }
    const patch: Parameters<typeof updateClinic>[1] = {};
    if (b.status === "active" || b.status === "suspended") patch.status = b.status;
    if (b.aiMonthlyLimit !== undefined) {
      const n = Number(b.aiMonthlyLimit);
      if (!Number.isInteger(n) || n < 0 || n > 100000) throw new HttpError(400, "AI上限は0以上の整数にしてください");
      patch.aiMonthlyLimit = n;
    }
    if (typeof b.note === "string") patch.note = b.note.slice(0, 500);
    if (typeof b.name === "string" && b.name.trim()) patch.name = b.name.trim().slice(0, 100);
    const updated = await updateClinic(id, patch);
    await logAction(actorOf(s), "clinic.update", id, { fields: Object.keys(patch), status: patch.status });
    return { clinic: updated };
  });
}
