import { handle } from "@/lib/api";
import { requireApiUser } from "@/lib/auth";
import { listAuditLogs } from "@/lib/repo/core";

export async function GET(request: Request) {
  return handle(async () => {
    await requireApiUser(["operator"]);
    const u = new URL(request.url);
    const clinic = u.searchParams.get("clinic");
    const rows = await listAuditLogs(clinic || null, 300, Number(u.searchParams.get("before")) || undefined);
    return rows.map((r) => ({ ...r, createdAt: r.createdAt.toISOString() }));
  });
}
