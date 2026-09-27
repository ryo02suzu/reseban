import { notFound } from "next/navigation";
import { ReportClient } from "@/components/ReportClient";
import { actorOf, requireClinicPage } from "@/lib/auth";
import { getRun } from "@/lib/repo/runs";
import { logAction } from "@/lib/repo/core";
import { getAiConfig } from "@/lib/ai/client";
import { getClaimHistory } from "@/lib/repo/rules";
import { compareOutcome } from "@/lib/rules/outcome";

export default async function ReportPage({ params }: { params: Promise<{ id: string }> }) {
  const s = await requireClinicPage();
  const { id } = await params;
  const run = /^[\w-]+$/.test(id) ? await getRun(s.clinic.id, id) : null;
  if (!run) notFound();
  // 医療情報の閲覧記録
  await logAction(actorOf(s), "audit.view", run.id);
  const aiReady = s.clinic.aiEnabled && getAiConfig().provider !== null;
  const outcome = run.demo ? undefined : compareOutcome(run.targetMonth, run.findings, await getClaimHistory(s.clinic.id));
  return <ReportClient key={run.createdAt} initialRun={run} aiReady={aiReady} outcome={outcome} />;
}
