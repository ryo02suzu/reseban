import { handle, HttpError, readJson } from "@/lib/api";
import { actorOf, getSession, TERMS_VERSION } from "@/lib/auth";
import { logAction, updateUser } from "@/lib/repo/core";

export async function POST(request: Request) {
  return handle(async () => {
    const s = await getSession();
    if (!s || s.pending2fa) throw new HttpError(401, "ログインしてください");
    const { agree } = await readJson<{ agree?: boolean }>(request);
    if (!agree) throw new HttpError(400, "同意が必要です");
    await updateUser(s.user.id, { termsAcceptedAt: new Date(), termsVersion: TERMS_VERSION });
    await logAction(actorOf(s), "terms.accept", s.user.id, { version: TERMS_VERSION });
  });
}
