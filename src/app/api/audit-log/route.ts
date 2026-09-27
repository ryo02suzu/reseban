import { handle } from "@/lib/api";
import { actorOf, requireClinicApi } from "@/lib/auth";
import { listAuditLogs, logAction } from "@/lib/repo/core";

export async function GET(request: Request) {
  return handle(async () => {
    const s = await requireClinicApi(["owner"]);
    const before = Number(new URL(request.url).searchParams.get("before")) || undefined;
    const rows = await listAuditLogs(s.clinic.id, 200, before);
    if (new URL(request.url).searchParams.get("format") === "csv") {
      await logAction(actorOf(s), "audit_log.export");
      const esc = (v: unknown) => `"${String(v ?? "").replace(/"/g, '""')}"`;
      const body =
        "﻿" +
        [["日時", "ユーザー", "操作", "対象", "IP", "詳細"], ...rows.map((r) => [r.createdAt.toISOString(), r.userEmail, r.action, r.target, r.ip, JSON.stringify(r.detail)])]
          .map((r) => r.map(esc).join(","))
          .join("\r\n");
      return new Response(body, {
        headers: { "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": 'attachment; filename="reseban-audit-log.csv"' },
      });
    }
    return rows.map((r) => ({ ...r, createdAt: r.createdAt.toISOString() }));
  });
}
