import { getRun } from "@/lib/store";
import { CATEGORY_LABELS, IMPACT_LABELS, STATUS_LABELS } from "@/lib/types";

type Ctx = { params: Promise<{ id: string }> };

const esc = (v: unknown) => {
  const s = String(v ?? "");
  return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

export async function GET(request: Request, { params }: Ctx) {
  const { id } = await params;
  const run = getRun(id);
  if (!run) return new Response("見つかりません", { status: 404 });
  const only = new URL(request.url).searchParams.get("finding");
  const rows = [
    ["種類", "カテゴリ", "状態", "カルテ番号", "レセプト番号", "診療月", "診療日", "部位", "項目", "点数", "金額(円)", "理由", "根拠", "直し方", "メモ"],
    ...run.findings
      .filter((f) => !only || f.id === only)
      .map((f) => [
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
  // Excel で文字化けしないよう BOM 付き UTF-8
  const body = "﻿" + rows.map((r) => r.map(esc).join(",")).join("\r\n");
  return new Response(body, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="reseban-${run.targetMonth}${only ? "-1" : ""}.csv"`,
    },
  });
}
