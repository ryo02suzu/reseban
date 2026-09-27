import { handle } from "@/lib/api";
import { actorOf, requireClinicApi } from "@/lib/auth";
import { logAction } from "@/lib/repo/core";
import { reprioritizeClinic } from "@/lib/repo/rules";

export async function POST() {
  return handle(async () => {
    const s = await requireClinicApi(["owner"]);
    const rules = await reprioritizeClinic(s.clinic.id);
    await logAction(actorOf(s), "rule.reprioritize");
    return { rules };
  });
}
