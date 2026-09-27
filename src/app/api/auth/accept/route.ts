import { handle, HttpError, readJson } from "@/lib/api";
import { clientIp, createSession, destroySession, destroyUserSessions, TERMS_VERSION } from "@/lib/auth";
import { createUser, findToken, getClinic, getUser, getUserByEmail, logAction, updateUser, consumeToken } from "@/lib/repo/core";
import { hashPassword, passwordProblem } from "@/lib/security/crypto";

/** 招待の受け入れ（アカウント作成）／パスワード再設定 */
export async function POST(request: Request) {
  return handle(async () => {
    const body = await readJson<{ token?: string; name?: string; email?: string; password?: string; agree?: boolean }>(request);
    const t = body.token ? await findToken(body.token) : null;
    if (!t) throw new HttpError(400, "リンクの有効期限が切れているか、すでに使われています。発行した人に再発行を依頼してください。");
    const ip = await clientIp();

    if (t.kind === "reset") {
      const user = t.userId ? await getUser(t.userId) : null;
      if (!user) throw new HttpError(400, "アカウントが見つかりません");
      const problem = passwordProblem(body.password ?? "", user.email);
      if (problem) throw new HttpError(400, problem);
      if (!(await consumeToken(body.token!))) throw new HttpError(400, "リンクはすでに使われています");
      await updateUser(user.id, { passwordHash: await hashPassword(body.password!), failedLogins: 0, lockedUntil: null, passwordChangedAt: new Date() });
      await destroyUserSessions(user.id);
      await logAction({ clinicId: user.clinicId, userId: user.id, userEmail: user.email, ip }, "password.reset", user.id);
      return { next: "/login" };
    }

    // 招待
    if (!body.agree) throw new HttpError(400, "利用規約とプライバシーポリシーへの同意が必要です");
    const email = (t.email || body.email || "").trim().toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new HttpError(400, "メールアドレスを正しく入力してください");
    const name = (body.name ?? "").trim().slice(0, 50);
    if (!name) throw new HttpError(400, "お名前を入力してください");
    const problem = passwordProblem(body.password ?? "", email);
    if (problem) throw new HttpError(400, problem);
    if (await getUserByEmail(email)) throw new HttpError(409, "このメールアドレスはすでに登録されています。ログインしてください。");
    if (t.clinicId) {
      const clinic = await getClinic(t.clinicId);
      if (!clinic || clinic.status !== "active") throw new HttpError(403, "この医院の利用は停止されています");
    }
    if (!(await consumeToken(body.token!))) throw new HttpError(400, "リンクはすでに使われています");
    const user = await createUser({
      clinicId: t.clinicId,
      email,
      name,
      role: t.role ?? "staff",
      passwordHash: await hashPassword(body.password!),
      termsVersion: TERMS_VERSION,
    });
    await logAction({ clinicId: user.clinicId, userId: user.id, userEmail: user.email, ip }, "invite.accept", user.id, { role: user.role, invitedBy: t.createdBy });
    await destroySession();
    await createSession(user.id, false);
    return { next: user.role === "operator" ? "/account/security?setup=1" : "/" };
  });
}
