import { handle, HttpError, readJson } from "@/lib/api";
import { actorOf, requireApiUser } from "@/lib/auth";
import { createToken, getUserByEmail, logAction } from "@/lib/repo/core";

export async function POST(request: Request) {
  return handle(async () => {
    const s = await requireApiUser(["operator"]);
    const { email } = await readJson<{ email?: string }>(request);
    const e = (email ?? "").trim().toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e)) throw new HttpError(400, "メールアドレスを正しく入力してください");
    if (await getUserByEmail(e)) throw new HttpError(409, "このメールアドレスはすでに登録されています");
    const token = await createToken({ kind: "invite", clinicId: null, role: "operator", email: e, createdBy: s.user.id, hours: 24 });
    await logAction(actorOf(s), "invite.create", e, { role: "operator" });
    return { path: `/invite/${token}` };
  });
}
