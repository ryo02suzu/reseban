import { handle } from "@/lib/api";
import { actorOf, requireApiUser } from "@/lib/auth";
import { logAction } from "@/lib/repo/core";
import { pingAi } from "@/lib/ai/tasks";

export async function POST() {
  return handle(async () => {
    const s = await requireApiUser(["operator"]);
    const model = await pingAi();
    await logAction(actorOf(s), "ai.ping", "", { model });
    return { model };
  });
}
