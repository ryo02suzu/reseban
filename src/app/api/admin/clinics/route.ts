import { handle, HttpError, readJson } from "@/lib/api";
import { actorOf, requireApiUser } from "@/lib/auth";
import { createClinic, createToken, getUserByEmail, logAction } from "@/lib/repo/core";

/** 医院を作り、院長（管理者）の招待リンクを返す */
export async function POST(request: Request) {
  return handle(async () => {
    const s = await requireApiUser(["operator"]);
    const { name, ownerEmail, note } = await readJson<{ name?: string; ownerEmail?: string; note?: string }>(request);
    if (!name?.trim()) throw new HttpError(400, "医院名を入力してください");
    const email = (ownerEmail ?? "").trim().toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new HttpError(400, "管理者のメールアドレスを正しく入力してください");
    if (await getUserByEmail(email)) throw new HttpError(409, "このメールアドレスはすでに登録されています");
    const clinic = await createClinic(name.trim().slice(0, 100), (note ?? "").slice(0, 500));
    const token = await createToken({ kind: "invite", clinicId: clinic.id, role: "owner", email, createdBy: s.user.id, hours: 24 * 7 });
    await logAction(actorOf(s), "clinic.create", clinic.id, { name: clinic.name, ownerEmail: email });
    return { clinic, path: `/invite/${token}` };
  });
}
