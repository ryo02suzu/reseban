import { Download } from "lucide-react";
import { AuditLogTable } from "@/components/AuditLogTable";
import { requireClinicPage } from "@/lib/auth";
import { listAuditLogs } from "@/lib/repo/core";

export default async function AuditLogPage() {
  const s = await requireClinicPage(["owner"]);
  const rows = await listAuditLogs(s.clinic.id, 300);
  return (
    <>
      <div className="page-head">
        <div>
          <h1>操作ログ</h1>
          <p>誰が・いつ・何をしたかの記録です（直近300件）。医療情報の閲覧・出力も記録しています。</p>
        </div>
        <div className="actions">
          <a className="btn btn-outline" href="/api/audit-log?format=csv">
            <Download size={18} aria-hidden /> CSVで出力
          </a>
        </div>
      </div>
      <section className="card">
        <AuditLogTable rows={rows.map((r) => ({ ...r, createdAt: r.createdAt.toISOString() }))} />
      </section>
    </>
  );
}
