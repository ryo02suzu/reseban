import { runDemoAudit } from "@/lib/audit";
import { handle } from "@/lib/api";
import { actorOf, requireClinicApi } from "@/lib/auth";
import { logAction } from "@/lib/repo/core";

export async function POST() {
  return handle(async () => {
    const s = await requireClinicApi();
    const run = await runDemoAudit(s.clinic, s.user.id);
    await logAction(actorOf(s), "audit.demo", run.id);
    return { id: run.id };
  });
}
