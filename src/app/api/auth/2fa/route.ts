import { handle, HttpError, readJson } from "@/lib/api";
import { actorOf, completeSecondFactor, destroySession, requireApiUser } from "@/lib/auth";
import { logAction, recordAttempt, tooManyAttempts, updateUser } from "@/lib/repo/core";
import { verifyTotp } from "@/lib/security/crypto";

export async function POST(request: Request) {
  return handle(async () => {
    const s = await requireApiUser(undefined, { allowPending: true });
    if (!s.pending2fa) return { next: "/" };
    const { code } = await readJson<{ code?: string }>(request);
    const key = `2fa:${s.user.id}`;
    if (await tooManyAttempts(key)) {
      await destroySession();
      throw new HttpError(429, "試行が多すぎます。最初からログインし直してください。");
    }
    if (!s.user.totpSecret || !verifyTotp(s.user.totpSecret, code ?? "")) {
      await recordAttempt(key);
      await logAction(actorOf(s), "login.failure", s.user.id, { reason: "totp" });
      throw new HttpError(401, "確認コードが違います");
    }
    await completeSecondFactor(s.sessionId);
    await updateUser(s.user.id, { lastLoginAt: new Date() });
    await logAction(actorOf(s), "login.success", s.user.id, { twoFactor: true });
    return { next: s.user.role === "operator" ? "/admin" : "/" };
  });
}
