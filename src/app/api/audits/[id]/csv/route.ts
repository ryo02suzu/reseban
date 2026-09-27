import { handle, notFound } from "@/lib/api";
import { actorOf, requireClinicApi } from "@/lib/auth";
import { logAction } from "@/lib/repo/core";
import { getRun } from "@/lib/repo/runs";
import { CATEGORY_LABELS, IMPACT_LABELS, STATUS_LABELS } from "@/lib/types";

type Ctx = { params: Promise<{ id: string }> };

/** Excel が数式として解釈しないように先頭の = + - @ を無害化する */
const esc = (v: unknown) => {
  let s = String(v ?? "");
  if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`;
  return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

export async function GET(request: Request, { params }: Ctx) {
  const { id } = await params;
  return handle(async () => {
    const s = await requireClinicApi();
    const run = await getRun(s.clinic.id, id);
    if (!run) notFound("チェック結果");
    const only = new URL(request.url).searchParams.get("finding");
    const list = run.findings.filter((f) => !only || f.id === only);
    const rows = [
      ["種類", "カテゴリ", "状態", "カルテ番号", "レセプト番号", "診療月", "診療日", "部位", "項目", "点数", "金額(円)", "理由", "根拠", "直し方", "メモ"],
      ...list.map((f) => [
        IMPACT_LABELS[f.impact],
        CATEGORY_LABELS[f.category],
        STATUS_LABELS[f.status],
        f.karteNo,
        f.receiptNo,
        f.month,
        f.date ?? "",
        f.tooth ?? "",
        f.itemName ?? "",
        f.points,
        f.amountYen,
        f.reason,
        f.basis,
        f.fix,
        f.memo ?? "",
      ]),
    ];
    await logAction(actorOf(s), "audit.export_csv", id, { rows: list.length });
    const body = "﻿" + rows.map((r) => r.map(esc).join(",")).join("\r\n");
    return new Response(body, {
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="reseban-${run.targetMonth}${only ? "-1" : ""}.csv"`,
        "Cache-Control": "no-store",
      },
    });
  });
}
