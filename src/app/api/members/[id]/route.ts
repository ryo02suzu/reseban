import { handle, HttpError, notFound, readJson } from "@/lib/api";
import { actorOf, destroyUserSessions, requireClinicApi } from "@/lib/auth";
import { createToken, getUser, listUsers, logAction, updateUser } from "@/lib/repo/core";

type Ctx = { params: Promise<{ id: string }> };

/**
 * { disabled } 利用停止・再開 / { role } 権限変更 / { action: "reset" } パスワード再設定リンク発行
 */
export async function PATCH(request: Request, { params }: Ctx) {
  const { id } = await params;
  return handle(async () => {
    const s = await requireClinicApi(["owner"]);
    const u = await getUser(id);
    if (!u || u.clinicId !== s.clinic.id) notFound("メンバー");
    const b = await readJson<{ disabled?: boolean; role?: "owner" | "staff"; action?: string }>(request);
    const owners = (await listUsers(s.clinic.id)).filter((x) => x.role === "owner" && !x.disabled);
    const isLastOwner = u.role === "owner" && owners.length <= 1;

    if (b.action === "reset") {
      const token = await createToken({ kind: "reset", clinicId: s.clinic.id, userId: u.id, email: u.email, createdBy: s.user.id, hours: 24 });
      await logAction(actorOf(s), "password.reset_link", u.id);
      return { path: `/invite/${token}`, expiresInHours: 24 };
    }
    if (typeof b.disabled === "boolean") {
      if (u.id === s.user.id) throw new HttpError(400, "自分自身は停止できません");
      if (b.disabled && isLastOwner) throw new HttpError(400, "最後の管理者は停止できません");
      await updateUser(u.id, { disabled: b.disabled });
      if (b.disabled) await destroyUserSessions(u.id);
      await logAction(actorOf(s), b.disabled ? "member.disable" : "member.enable", u.id);
    }
    if (b.role === "owner" || b.role === "staff") {
      if (b.role === "staff" && isLastOwner) throw new HttpError(400, "最後の管理者の権限は変えられません");
      await updateUser(u.id, { role: b.role });
      await logAction(actorOf(s), "member.role", u.id, { role: b.role });
    }
    return { ok: true };
  });
}
