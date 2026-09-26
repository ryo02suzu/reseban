import { notFound } from "next/navigation";
import { connection } from "next/server";
import { ReportClient } from "@/components/ReportClient";
import { getRun, getSettings } from "@/lib/store";
import { getAiConfig } from "@/lib/ai/client";

export default async function ReportPage({ params }: { params: Promise<{ id: string }> }) {
  await connection();
  const { id } = await params;
  const run = /^[\w-]+$/.test(id) ? getRun(id) : null;
  if (!run) notFound();
  const aiReady = getSettings().aiEnabled && getAiConfig().provider !== null;
  return <ReportClient key={run.createdAt} initialRun={run} aiReady={aiReady} />;
}
