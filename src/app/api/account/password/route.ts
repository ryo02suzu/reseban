import { handle, HttpError, readJson } from "@/lib/api";
import { actorOf, destroyUserSessions, requireApiUser } from "@/lib/auth";
import { logAction, updateUser } from "@/lib/repo/core";
import { hashPassword, passwordProblem, verifyPassword } from "@/lib/security/crypto";

export async function POST(request: Request) {
  return handle(async () => {
    const s = await requireApiUser(undefined, { allowPending: false });
    const { current, next } = await readJson<{ current?: string; next?: string }>(request);
    if (!(await verifyPassword(current ?? "", s.user.passwordHash))) throw new HttpError(400, "今のパスワードが違います");
    const problem = passwordProblem(next ?? "", s.user.email);
    if (problem) throw new HttpError(400, problem);
    await updateUser(s.user.id, { passwordHash: await hashPassword(next!), passwordChangedAt: new Date() });
    await destroyUserSessions(s.user.id, s.sessionId);
    await logAction(actorOf(s), "password.change", s.user.id);
  });
}
