import { handle } from "@/lib/api";
import { actorOf, destroySession, getSession } from "@/lib/auth";
import { logAction } from "@/lib/repo/core";

export async function POST() {
  return handle(async () => {
    const s = await getSession();
    if (s) await logAction(actorOf(s), "logout", s.user.id);
    await destroySession();
    return { next: "/login" };
  });
}
