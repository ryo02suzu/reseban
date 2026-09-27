import type { Finding } from "../types";
import { norm } from "./engine";
import type { ClaimHistoryRow } from "./types";

/**
 * 答え合わせ：実際に返戻・査定された項目を、レセ番が事前に指摘できていたか。
 * 同じ診療月で、項目名が一致（どちらかがもう一方を含む）し、患者IDが分かっていれば同じ患者の指摘を「的中」とする。
 */
export interface OutcomeRow {
  row: ClaimHistoryRow;
  /** 的中した指摘（なければ見逃し） */
  findingId?: string;
}

export interface OutcomeSummary {
  month: string;
  total: number;
  caught: number;
  rows: OutcomeRow[];
  /** 実際には返戻・査定されなかった指摘の数（事前に直して防げたもの、または誤検知） */
  findingsWithoutClaim: number;
}

function sameItem(a: string, b: string) {
  const x = norm(a);
  const y = norm(b);
  return !!x && !!y && (x.includes(y) || y.includes(x));
}

export function compareOutcome(month: string, findings: Pick<Finding, "id" | "itemName" | "karteNo" | "month">[], history: ClaimHistoryRow[]): OutcomeSummary {
  const rows = history.filter((r) => r.month === month);
  const used = new Set<string>();
  const out: OutcomeRow[] = rows.map((row) => {
    const hit = findings.find(
      (f) => !used.has(f.id) && sameItem(f.itemName ?? "", row.itemName) && (!row.patientId || f.karteNo === row.patientId),
    );
    if (hit) used.add(hit.id);
    return { row, findingId: hit?.id };
  });
  return {
    month,
    total: rows.length,
    caught: out.filter((r) => r.findingId).length,
    rows: out,
    findingsWithoutClaim: findings.filter((f) => !used.has(f.id)).length,
  };
}
