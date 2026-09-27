import { notFound } from "next/navigation";
import { ReportClient } from "@/components/ReportClient";
import { actorOf, requireClinicPage } from "@/lib/auth";
import { getRun } from "@/lib/repo/runs";
import { logAction } from "@/lib/repo/core";
import { getAiConfig } from "@/lib/ai/client";

export default async function ReportPage({ params }: { params: Promise<{ id: string }> }) {
  const s = await requireClinicPage();
  const { id } = await params;
  const run = /^[\w-]+$/.test(id) ? await getRun(s.clinic.id, id) : null;
  if (!run) notFound();
  // 医療情報の閲覧記録
  await logAction(actorOf(s), "audit.view", run.id);
  const aiReady = s.clinic.aiEnabled && getAiConfig().provider !== null;
  return <ReportClient key={run.createdAt} initialRun={run} aiReady={aiReady} />;
}
