import { handle, HttpError, readJson } from "@/lib/api";
import { actorOf, requireClinicApi } from "@/lib/auth";
import { createToken, getUserByEmail, listUsers, logAction } from "@/lib/repo/core";

export async function GET() {
  return handle(async () => {
    const s = await requireClinicApi(["owner"]);
    const users = await listUsers(s.clinic.id);
    return users.map((u) => ({
      id: u.id,
      email: u.email,
      name: u.name,
      role: u.role,
      disabled: u.disabled,
      totpEnabled: u.totpEnabled,
      lastLoginAt: u.lastLoginAt?.toISOString() ?? null,
    }));
  });
}

/** 招待リンクを発行（メール送信はせず、画面に出したリンクを院内で伝える） */
export async function POST(request: Request) {
  return handle(async () => {
    const s = await requireClinicApi(["owner"]);
    const { email, role } = await readJson<{ email?: string; role?: "owner" | "staff" }>(request);
    const e = (email ?? "").trim().toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e)) throw new HttpError(400, "メールアドレスを正しく入力してください");
    if (await getUserByEmail(e)) throw new HttpError(409, "このメールアドレスはすでに登録されています");
    const r = role === "owner" ? "owner" : "staff";
    const token = await createToken({ kind: "invite", clinicId: s.clinic.id, role: r, email: e, createdBy: s.user.id });
    await logAction(actorOf(s), "invite.create", e, { role: r });
    return { path: `/invite/${token}`, expiresInHours: 72 };
  });
}
