import { AuditLogTable } from "@/components/AuditLogTable";
import { requirePageUser } from "@/lib/auth";
import { listAuditLogs, listClinics } from "@/lib/repo/core";

export default async function AdminAuditLogPage() {
  await requirePageUser(["operator"]);
  const [rows, clinics] = await Promise.all([listAuditLogs(null, 300), listClinics()]);
  return (
    <>
      <div className="page-head">
        <div>
          <h1>操作ログ（全体）</h1>
          <p>全医院・運営者の操作記録です（直近300件）。</p>
        </div>
      </div>
      <section className="card">
        <AuditLogTable
          rows={rows.map((r) => ({ ...r, createdAt: r.createdAt.toISOString() }))}
          clinicNames={Object.fromEntries(clinics.map((c) => [c.id, c.name]))}
        />
      </section>
    </>
  );
}
