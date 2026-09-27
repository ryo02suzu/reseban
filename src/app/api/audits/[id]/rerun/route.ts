import { rerunAudit } from "@/lib/audit";
import { handle, notFound } from "@/lib/api";
import { actorOf, requireClinicApi } from "@/lib/auth";
import { logAction } from "@/lib/repo/core";

type Ctx = { params: Promise<{ id: string }> };

export async function POST(_: Request, { params }: Ctx) {
  const { id } = await params;
  return handle(async () => {
    const s = await requireClinicApi();
    const run = (await rerunAudit(s.clinic, id, s.user.id)) ?? notFound("チェック結果");
    await logAction(actorOf(s), "audit.rerun", run.id, { findings: run.findings.length });
    return { id: run.id };
  });
}
