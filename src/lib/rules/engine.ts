import type { AuditSummary, Finding, Settings } from "../types";
import { CATEGORY_ORDER } from "../types";
import type { Act, ParsedReceipt } from "../uke/types";
import type { MasterEntry } from "../master/parse";
import { teethLabel } from "../teeth";
import type {
  CommentRule,
  DiagnosisRule,
  ExclusiveRule,
  FacilityRule,
  FrequencyRule,
  ItemRef,
  PrerequisiteRule,
  Rule,
} from "./types";

/**
 * ルールエンジン。合否はここだけで決める（AI は使わない）。
 * 同じ入力からは必ず同じ結果が出る純粋関数にしている。
 */

export function norm(s: string): string {
  return s.normalize("NFKC").replace(/\s+/g, "").toUpperCase();
}

export function matches(act: Pick<Act, "code" | "name">, ref: ItemRef | undefined): boolean {
  if (!ref) return false;
  if (ref.codes?.includes(act.code)) return true;
  if (!act.name || !ref.names?.length) return false;
  const n = norm(act.name);
  if (ref.excludeNames?.some((x) => n.includes(norm(x)))) return false;
  return ref.names.some((x) => n.includes(norm(x)));
}

export function monthsBack(ym: string, k: number): string {
  const y = Number(ym.slice(0, 4));
  const m = Number(ym.slice(4, 6)) - 1 - k;
  const d = new Date(Date.UTC(y, m, 1));
  return `${d.getUTCFullYear()}${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
}

export interface EngineInput {
  current: ParsedReceipt[];
  history: ParsedReceipt[];
  rules: Rule[];
  settings: Pick<Settings, "facilityStandards">;
  master?: Map<string, MasterEntry>;
}

type Draft = Omit<Finding, "id" | "status" | "ruleId" | "ruleName" | "category" | "impact" | "basis" | "fix" | "amountYen" | "karteNo" | "receiptNo" | "month">;

export function runRules(input: EngineInput): Finding[] {
  const byPatient = new Map<string, ParsedReceipt[]>();
  for (const r of [...input.history, ...input.current]) {
    const list = byPatient.get(r.patientKey) ?? [];
    list.push(r);
    byPatient.set(r.patientKey, list);
  }
  const filed = new Set(input.settings.facilityStandards.filter((s) => s.filed).map((s) => norm(s.name)));

  const findings: Finding[] = [];
  const rules = input.rules.filter((r) => r.enabled).sort((a, b) => a.priority - b.priority);

  for (const rec of input.current) {
    const patientReceipts = byPatient.get(rec.patientKey) ?? [rec];
    for (const rule of rules) {
      let drafts: Draft[] = [];
      switch (rule.kind) {
        case "frequency":
          drafts = checkFrequency(rule, rec, patientReceipts);
          break;
        case "exclusive":
          drafts = checkExclusive(rule, rec);
          break;
        case "prerequisite":
          drafts = checkPrerequisite(rule, rec, patientReceipts);
          break;
        case "diagnosis":
          drafts = checkDiagnosis(rule, rec);
          break;
        case "comment":
          drafts = checkComment(rule, rec);
          break;
        case "facility":
          drafts = checkFacility(rule, rec, filed, input.master);
          break;
      }
      drafts.forEach((d, i) => {
        findings.push({
          ...d,
          id: `${rule.id}:${rec.receiptNo}:${i}`,
          ruleId: rule.id,
          ruleName: rule.name,
          category: rule.category,
          impact: rule.impact,
          basis: rule.basis,
          fix: rule.fix,
          karteNo: rec.karteNo,
          receiptNo: rec.receiptNo,
          month: rec.month,
          amountYen: d.points * 10,
          status: "open",
        });
      });
    }
  }
  return findings;
}

function toothOf(act: Act) {
  return act.teeth.length ? teethLabel(act.teeth) : undefined;
}

function lastDate(acts: Act[]) {
  return acts.flatMap((a) => a.dates).sort().at(-1);
}

function mdLabel(d: string) {
  return `${Number(d.slice(5, 7))}/${Number(d.slice(8, 10))}`;
}

// ---------- 1. 回数・間隔 ----------
function checkFrequency(rule: FrequencyRule, rec: ParsedReceipt, patient: ParsedReceipt[]): Draft[] {
  const hits = rec.acts.filter((a) => matches(a, rule.target));
  if (!hits.length) return [];
  const out: Draft[] = [];

  const groups = new Map<string, Act[]>();
  for (const a of hits) {
    const keys = rule.perTooth && a.teeth.length ? a.teeth : ["*"];
    for (const k of keys) groups.set(k, [...(groups.get(k) ?? []), a]);
  }

  for (const [tooth, acts] of groups) {
    const sample = acts[0];
    const toothLbl = tooth === "*" ? toothOf(sample) : teethLabel([tooth]);
    if (rule.per === "day") {
      const perDay = new Map<string, number>();
      for (const a of acts) for (const d of a.dates) perDay.set(d, (perDay.get(d) ?? 0) + 1);
      for (const [d, n] of perDay) {
        if (n > rule.max) {
          out.push({
            date: d,
            tooth: toothLbl,
            itemCode: sample.code,
            itemName: sample.name,
            points: sample.points * (n - rule.max),
            reason: `${mdLabel(d)}に${n}回算定されています（同日${rule.max}回まで）。`,
          });
        }
      }
      continue;
    }

    const monthCount = acts.reduce((s, a) => s + a.count, 0);
    let total = monthCount;
    let span = "同月";
    const pastDetail: string[] = [];
    if (rule.per === "months") {
      const months = rule.months ?? 1;
      const from = monthsBack(rec.month, months - 1);
      for (const r of patient) {
        if (r === rec || r.month < from || r.month >= rec.month) continue;
        const n = r.acts
          .filter((a) => matches(a, rule.target) && (tooth === "*" || a.teeth.includes(tooth)))
          .reduce((s, a) => s + a.count, 0);
        if (n) {
          total += n;
          pastDetail.push(`${Number(r.month.slice(4))}月に${n}回`);
        }
      }
      span = `${months}ヶ月以内`;
    }
    if (total > rule.max) {
      const excess = Math.min(total - rule.max, monthCount);
      if (excess <= 0) continue;
      const dates = acts.flatMap((a) => a.dates).sort();
      out.push({
        date: dates.at(-1),
        tooth: toothLbl,
        itemCode: sample.code,
        itemName: sample.name,
        points: sample.points * excess,
        reason:
          `${span}に${total}回算定されています（${rule.max}回まで）。` +
          (dates.length ? `当月の算定日：${dates.map(mdLabel).join("、")}。` : "") +
          (pastDetail.length ? `過去分：${pastDetail.join("、")}。` : ""),
      });
    }
  }
  return out;
}

// ---------- 2. 併算定不可 ----------
function checkExclusive(rule: ExclusiveRule, rec: ParsedReceipt): Draft[] {
  const as = rec.acts.filter((a) => matches(a, rule.a));
  const bs = rec.acts.filter((a) => matches(a, rule.b));
  if (!as.length || !bs.length) return [];
  const out: Draft[] = [];
  for (const b of bs) {
    for (const a of as) {
      if (a === b) continue;
      if (rule.sameTooth && !a.teeth.some((t) => b.teeth.includes(t))) continue;
      let date: string | undefined;
      if (rule.scope === "day") {
        date = a.dates.find((d) => b.dates.includes(d));
        if (!date) continue;
      }
      out.push({
        date: date ?? b.dates[0],
        tooth: toothOf(b),
        itemCode: b.code,
        itemName: b.name,
        points: b.points,
        reason: `「${a.name}」と「${b.name}」を${rule.scope === "day" ? `同日（${mdLabel(date!)}）` : "同月"}に算定しています。`,
      });
      break;
    }
  }
  return out;
}

// ---------- 3. 前提の検査・管理 ----------
function checkPrerequisite(rule: PrerequisiteRule, rec: ParsedReceipt, patient: ParsedReceipt[]): Draft[] {
  const targets = rec.acts.filter((a) => matches(a, rule.target));
  if (!targets.length) return [];
  const from = monthsBack(rec.month, rule.lookbackMonths);
  const firstTarget = targets.flatMap((a) => a.dates).sort()[0];

  const found = patient.some((r) => {
    if (r.month < from || r.month > rec.month) return false;
    return r.acts.some((a) => {
      if (!matches(a, rule.required)) return false;
      if (r.month < rec.month || !rule.mustPrecede || !firstTarget || !a.dates.length) return true;
      return a.dates.some((d) => d <= firstTarget);
    });
  });
  if (found) return [];

  const t = targets[0];
  const range = rule.lookbackMonths === 0 ? "同月" : `過去${rule.lookbackMonths}ヶ月（当月含む）`;
  return [
    {
      date: firstTarget,
      tooth: toothOf(t),
      itemCode: t.code,
      itemName: t.name,
      points: targets.reduce((s, a) => s + a.points * a.count, 0),
      reason: `${range}に前提となる「${(rule.required.names ?? rule.required.codes ?? []).join("／")}」の算定がありません${rule.mustPrecede ? "（算定日より前に必要）" : ""}。`,
    },
  ];
}

// ---------- 4. 病名・部位 ----------
function checkDiagnosis(rule: DiagnosisRule, rec: ParsedReceipt): Draft[] {
  const out: Draft[] = [];
  const wanted = rule.diagnosis.names.map(norm);
  const diagOk = (d: { code: string; name: string }) =>
    rule.diagnosis.codes?.includes(d.code) || wanted.some((w) => norm(d.name).includes(w));

  for (const act of rec.acts.filter((a) => matches(a, rule.target))) {
    const candidates = rec.diagnoses.filter(diagOk);
    let ok = candidates.length > 0;
    let missingTeeth: string[] = [];
    if (ok && rule.matchTooth && act.teeth.length) {
      const covered = new Set(candidates.flatMap((d) => d.teeth));
      // 部位の無い病名は全顎扱い
      if (!candidates.some((d) => d.teeth.length === 0)) {
        missingTeeth = act.teeth.filter((t) => !covered.has(t));
        ok = missingTeeth.length === 0;
      }
    }
    if (ok) continue;
    const want = rule.diagnosis.names.join("／");
    out.push({
      date: act.dates[0],
      tooth: toothOf(act),
      itemCode: act.code,
      itemName: act.name,
      points: act.points * act.count,
      reason: missingTeeth.length
        ? `${teethLabel(missingTeeth)}に「${want}」の病名がありません。`
        : `レセプトに「${want}」の病名がありません。`,
    });
  }
  return out;
}

// ---------- 5. 必須コメント ----------
function checkComment(rule: CommentRule, rec: ParsedReceipt): Draft[] {
  const out: Draft[] = [];
  const codes = rule.comment.codes ?? [];
  const kws = (rule.comment.keywords ?? []).map(norm);
  for (const act of rec.acts.filter((a) => matches(a, rule.target))) {
    const ok = act.comments.some((c) => {
      if (codes.includes(c.code)) return true;
      if (!codes.length && !kws.length) return true;
      return kws.some((k) => norm(c.text).includes(k));
    });
    if (ok) continue;
    out.push({
      date: act.dates[0],
      tooth: toothOf(act),
      itemCode: act.code,
      itemName: act.name,
      points: act.points * act.count,
      reason: act.comments.length ? "必要な内容のコメントが見当たりません。" : "コメントが付いていません。",
    });
  }
  return out;
}

// ---------- 6. 施設基準 ----------
function checkFacility(
  rule: FacilityRule,
  rec: ParsedReceipt,
  filed: Set<string>,
  master?: Map<string, MasterEntry>,
): Draft[] {
  const isFiled = filed.has(norm(rule.standard));
  if (rule.mode === "required") {
    if (isFiled) return [];
    return rec.acts
      .filter((a) => matches(a, rule.target))
      .map((act) => ({
        date: act.dates[0],
        tooth: toothOf(act),
        itemCode: act.code,
        itemName: act.name,
        points: act.points * act.count,
        reason: `「${rule.standard}」の届出が設定されていないのに算定しています。`,
      }));
  }

  if (!isFiled) return [];
  const whens = rec.acts.filter((a) => matches(a, rule.when));
  if (!whens.length) return [];
  if (rec.acts.some((a) => matches(a, rule.expect))) return [];

  let expectName = (rule.expect?.names ?? [])[0] ?? rule.standard;
  let expectPoints = rule.expectPoints ?? 0;
  if (master) {
    for (const e of master.values()) {
      if (matches(e, rule.expect)) {
        expectName = e.name;
        expectPoints = e.points ?? expectPoints;
        break;
      }
    }
  }
  const times = Math.max(1, whens.reduce((s, a) => s + (a.dates.length || a.count), 0));
  return [
    {
      date: lastDate(whens),
      itemCode: undefined,
      itemName: expectName,
      points: expectPoints * times,
      reason: `「${rule.standard}」は届出済みですが、「${whens[0].name}」に「${expectName}」が付いていません（${times}回分）。`,
    },
  ];
}

// ---------- サマリー ----------
export function summarize(findings: Finding[], receiptCount: number): AuditSummary {
  const active = findings.filter((f) => f.status !== "ignored");
  const byCategory = Object.fromEntries(CATEGORY_ORDER.map((c) => [c, 0])) as AuditSummary["byCategory"];
  for (const f of active) byCategory[f.category]++;
  const henreiReceipts = new Set(active.filter((f) => f.impact === "henrei").map((f) => `${f.month}:${f.receiptNo}`));
  return {
    receiptCount,
    henreiCount: henreiReceipts.size,
    sateiYen: active.filter((f) => f.impact === "satei").reduce((s, f) => s + f.amountYen, 0),
    moreYen: active.filter((f) => f.impact === "more").reduce((s, f) => s + f.amountYen, 0),
    byCategory,
  };
}
