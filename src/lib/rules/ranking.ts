import { decodeUke, splitCsv } from "../uke/text";
import { norm, matches } from "./engine";
import type { ClaimHistoryRow, RankingRow, Rule } from "./types";

/**
 * 返戻・査定の実績CSVを読む。
 * 列：年月, 区分(返戻/査定), 項目名, 事由, 点数, カルテ番号（任意）（1行目が見出しなら読み飛ばす）
 */
export function parseClaimHistory(buf: ArrayBuffer | Uint8Array): ClaimHistoryRow[] {
  const rows: ClaimHistoryRow[] = [];
  for (const line of decodeUke(buf).split(/\r?\n/)) {
    if (!line.trim()) continue;
    const f = splitCsv(line).map((v) => v.trim());
    if (f.length < 3) continue;
    const kindText = f[1];
    const kind = kindText.includes("返戻") ? "henrei" : kindText.includes("査定") || kindText.includes("減点") ? "satei" : null;
    if (!kind) continue;
    rows.push({
      month: f[0].replace(/[^\d]/g, "").slice(0, 6),
      kind,
      itemName: f[2],
      reason: f[3] ?? "",
      points: Math.abs(Number(f[4]) || 0),
      ...(f[5] ? { patientId: f[5].slice(0, 30) } : {}),
    });
  }
  return rows;
}

function ruleRefs(rule: Rule) {
  switch (rule.kind) {
    case "official":
      return [];
    case "exclusive":
      return [rule.a, rule.b];
    case "facility":
      return [rule.target, rule.when, rule.expect];
    default:
      return [rule.target];
  }
}

export function ruleMatchesItem(rule: Rule, itemName: string): boolean {
  return ruleRefs(rule).some((ref) => matches({ code: "", name: itemName }, ref));
}

export function buildRanking(rows: ClaimHistoryRow[], rules: Rule[]): RankingRow[] {
  const map = new Map<string, RankingRow>();
  for (const r of rows) {
    const key = norm(r.itemName);
    const cur = map.get(key) ?? { label: r.itemName, count: 0, points: 0 };
    cur.count++;
    cur.points += r.points;
    map.set(key, cur);
  }
  const list = [...map.values()].sort((a, b) => b.count - a.count || b.points - a.points);
  for (const row of list) row.ruleId = rules.find((rule) => ruleMatchesItem(rule, row.label))?.id;
  return list;
}

/** 実績件数を各ルールに付け、件数の多い順に優先順位を振り直す */
export function reprioritize(rules: Rule[], rows: ClaimHistoryRow[]): Rule[] {
  const counted = rules.map((rule) => ({
    ...rule,
    historyCount: rows.filter((r) => ruleMatchesItem(rule, r.itemName)).length,
  }));
  counted.sort((a, b) => (b.historyCount ?? 0) - (a.historyCount ?? 0) || a.priority - b.priority);
  return counted.map((r, i) => ({ ...r, priority: i + 1 }));
}
