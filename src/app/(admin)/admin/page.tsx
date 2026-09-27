import { AdminClinicsClient } from "@/components/AdminClinicsClient";
import { requirePageUser } from "@/lib/auth";
import { aiUsageByClinic, listClinics, listUsers, masterStatuses } from "@/lib/repo/core";
import { runCounts } from "@/lib/repo/runs";
import { MASTER_KINDS } from "@/lib/master/types";

export default async function AdminHome() {
  await requirePageUser(["operator"]);
  const month = new Date().toISOString().slice(0, 7).replace("-", "");
  const [clinics, counts, usage, masters] = await Promise.all([listClinics(), runCounts(), aiUsageByClinic(month), masterStatuses()]);
  const members = await Promise.all(clinics.map((c) => listUsers(c.id)));
  const missingMasters = MASTER_KINDS.filter((k) => k.required && !masters.some((m) => m.kind === k.kind)).map((k) => k.label);
  return (
    <AdminClinicsClient
      missingMasters={missingMasters}
      initial={clinics.map((c, i) => ({
        id: c.id,
        name: c.name,
        code: c.code,
        status: c.status,
        note: c.note,
        aiMonthlyLimit: c.aiMonthlyLimit,
        aiUsed: usage.find((u) => u.clinicId === c.id)?.count ?? 0,
        members: members[i].filter((u) => !u.disabled).length,
        runs: counts.find((x) => x.clinicId === c.id)?.runs ?? 0,
        lastRun: counts.find((x) => x.clinicId === c.id)?.last ?? null,
        createdAt: c.createdAt.toISOString(),
      }))}
    />
  );
}
