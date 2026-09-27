import { handle, HttpError, readJson } from "@/lib/api";
import { clientIp, createSession, destroySession } from "@/lib/auth";
import { getClinic, getUserByEmail, logAction, recordAttempt, tooManyAttempts, updateUser } from "@/lib/repo/core";
import { verifyPassword } from "@/lib/security/crypto";

const MAX_FAILS = 5;
const LOCK_MINUTES = 15;
const GENERIC = "メールアドレスまたはパスワードが違います";

export async function POST(request: Request) {
  return handle(async () => {
    const { email, password } = await readJson<{ email?: string; password?: string }>(request);
    const ip = await clientIp();
    if (await tooManyAttempts(`ip:${ip}`)) throw new HttpError(429, "ログインの試行が多すぎます。15分ほど待ってから再度お試しください。");
    if (!email || !password) throw new HttpError(400, "メールアドレスとパスワードを入力してください");
    const user = await getUserByEmail(email);
    if (!user) {
      await recordAttempt(`ip:${ip}`);
      await logAction({ ip, userEmail: email.slice(0, 100) }, "login.failure", "", { reason: "unknown_user" });
      throw new HttpError(401, GENERIC);
    }
    const actor = { clinicId: user.clinicId, userId: user.id, userEmail: user.email, ip };
    if (user.lockedUntil && user.lockedUntil > new Date()) {
      throw new HttpError(423, "続けて失敗したため一時的にロックしています。15分ほど待ってから再度お試しください。");
    }
    if (!(await verifyPassword(password, user.passwordHash))) {
      await recordAttempt(`ip:${ip}`);
      const fails = user.failedLogins + 1;
      await updateUser(user.id, {
        failedLogins: fails >= MAX_FAILS ? 0 : fails,
        lockedUntil: fails >= MAX_FAILS ? new Date(Date.now() + LOCK_MINUTES * 60_000) : null,
      });
      await logAction(actor, "login.failure", user.id, { reason: "password", locked: fails >= MAX_FAILS });
      throw new HttpError(401, GENERIC);
    }
    if (user.disabled) throw new HttpError(403, "このアカウントは停止されています。医院の管理者に連絡してください。");
    if (user.clinicId) {
      const clinic = await getClinic(user.clinicId);
      if (!clinic || clinic.status !== "active") throw new HttpError(403, "この医院の利用は停止されています。運営者に連絡してください。");
    }
    await destroySession();
    await createSession(user.id, user.totpEnabled);
    await updateUser(user.id, { failedLogins: 0, lockedUntil: null, ...(user.totpEnabled ? {} : { lastLoginAt: new Date() }) });
    await logAction(actor, user.totpEnabled ? "login.password_ok" : "login.success", user.id);
    return { next: user.totpEnabled ? "2fa" : user.role === "operator" ? "/admin" : "/" };
  });
}
