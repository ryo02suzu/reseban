import { ClaimsClient } from "@/components/ClaimsClient";
import { requireClinicPage } from "@/lib/auth";
import { getClaimHistory } from "@/lib/repo/rules";
import { getRun, listRuns } from "@/lib/repo/runs";
import { compareOutcome, type OutcomeSummary } from "@/lib/rules/outcome";

export const metadata = { title: "返戻・査定の記録 | レセ番" };

export default async function ClaimsPage() {
  const s = await requireClinicPage();
  const [rows, runs] = await Promise.all([getClaimHistory(s.clinic.id), listRuns(s.clinic.id)]);
  // 記録のある月ごとに、その月の最新のチェック結果（サンプル以外）と答え合わせ
  const outcomes: (OutcomeSummary & { runId: string })[] = [];
  for (const month of [...new Set(rows.map((r) => r.month))].sort().reverse()) {
    const item = runs.find((r) => r.targetMonth === month && !r.demo);
    const run = item ? await getRun(s.clinic.id, item.id) : null;
    if (run) outcomes.push({ ...compareOutcome(month, run.findings, rows), runId: run.id });
  }
  return <ClaimsClient initialRows={rows} outcomes={outcomes} canImport={s.user.role === "owner"} />;
}
