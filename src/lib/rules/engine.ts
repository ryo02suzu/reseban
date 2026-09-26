import type { AuditSummary, CheckCategory, Finding, Impact } from "../types";
import { CATEGORY_ORDER } from "../types";
import type { Act, ParsedReceipt } from "../uke/types";
import type { MasterIndex } from "../master/bundle";
import { EMPTY_INDEX } from "../master/bundle";
import { isBlock, teethLabel, toothOf } from "../teeth";
import { checkOfficial, unitPoints } from "./official";
import { TODOKEDE_TO_FACILITY, facilityNameOf } from "./facility";
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
  /** 医院が届け出ている施設基準コード */
  filedFacility: string[];
  master?: MasterIndex;
}

interface Draft {
  date?: string;
  tooth?: string;
  itemCode?: string;
  itemName?: string;
  points: number;
  reason: string;
}

export function runRules(input: EngineInput): Finding[] {
  const master = input.master ?? EMPTY_INDEX;
  const byPatient = new Map<string, ParsedReceipt[]>();
  for (const r of [...input.history, ...input.current]) {
    const list = byPatient.get(r.patientKey) ?? [];
    list.push(r);
    byPatient.set(r.patientKey, list);
  }
  const filed = new Set(input.filedFacility);
  const findings: Finding[] = [];
  const rules = input.rules.filter((r) => r.enabled).sort((a, b) => a.priority - b.priority);
  const ctx = { master, filed };

  for (const rec of input.current) {
    const patient = byPatient.get(rec.patientKey) ?? [rec];
    const past = patient.filter((r) => r.month < rec.month);
    for (const rule of rules) {
      let drafts: Draft[] = [];
      switch (rule.kind) {
        case "official":
          drafts = checkOfficial(rule.table, { rec, past, master, filedFacility: filed });
          break;
        case "frequency":
          drafts = checkFrequency(rule, rec, patient, ctx);
          break;
        case "exclusive":
          drafts = checkExclusive(rule, rec, ctx);
          break;
        case "prerequisite":
          drafts = checkPrerequisite(rule, rec, patient, ctx);
          break;
        case "diagnosis":
          drafts = checkDiagnosis(rule, rec, ctx);
          break;
        case "comment":
          drafts = checkComment(rule, rec, ctx);
          break;
        case "facility":
          drafts = checkFacility(rule, rec, ctx);
          break;
      }
      drafts.forEach((d, i) => {
        findings.push({
          ...d,
          id: `${rule.id}:${rec.receiptNo}:${d.itemCode ?? ""}:${i}`,
          ruleId: rule.id,
          ruleName: rule.name,
          category: rule.category as CheckCategory,
          impact: rule.impact as Impact,
          basis: rule.basis,
          fix: rule.fix,
          karteNo: rec.karteNo,
          receiptNo: rec.receiptNo,
          month: rec.month,
          amountYen: Math.round(d.points * 10),
          status: "open",
        });
      });
    }
  }
  return findings;
}

type Ctx = { master: MasterIndex; filed: Set<string> };

function toothLbl(act: Act, ctx: Ctx) {
  return act.teeth.length ? teethLabel(act.teeth, ctx.master.shishiki) : undefined;
}

const md = (d: string) => `${Number(d.slice(5, 7))}/${Number(d.slice(8, 10))}`;

function amount(acts: Act[], ctx: Ctx, count?: number) {
  const n = count ?? acts.reduce((s, a) => s + a.count, 0);
  return unitPoints(acts.at(-1)!, ctx.master) * n;
}

function label(ref: ItemRef) {
  return (ref.names ?? ref.codes ?? []).join("／");
}

// ---------- 1. 回数・間隔 ----------
function checkFrequency(rule: FrequencyRule, rec: ParsedReceipt, patient: ParsedReceipt[], ctx: Ctx): Draft[] {
  const acts = rec.acts.filter((a) => matches(a, rule.target));
  if (!acts.length) return [];
  const sample = acts[0];
  const dates = acts.flatMap((a) => a.dates).sort();

  if (rule.per === "day") {
    const perDay = new Map<string, number>();
    for (const d of dates) perDay.set(d, (perDay.get(d) ?? 0) + 1);
    return [...perDay]
      .filter(([, n]) => n > rule.max)
      .map(([d, n]) => ({
        date: d,
        itemCode: sample.code,
        itemName: sample.name,
        points: amount(acts, ctx, n - rule.max),
        reason: `${md(d)}に${n}回算定されています（同日${rule.max}回まで）。`,
      }));
  }

  const monthCount = acts.reduce((s, a) => s + a.count, 0);
  let total = monthCount;
  const detail: string[] = [];
  if (rule.per === "months") {
    const from = monthsBack(rec.month, (rule.months ?? 1) - 1);
    for (const r of patient) {
      if (r === rec || r.month < from || r.month >= rec.month) continue;
      const n = r.acts.filter((a) => matches(a, rule.target)).reduce((s, a) => s + a.count, 0);
      if (n) {
        total += n;
        detail.push(`${Number(r.month.slice(4))}月に${n}回`);
      }
    }
  }
  if (total <= rule.max) return [];
  const excess = Math.min(total - rule.max, monthCount);
  const span = rule.per === "month" ? "同月" : `${rule.months}ヶ月以内`;
  return [
    {
      date: dates.at(-1),
      itemCode: sample.code,
      itemName: sample.name,
      points: amount(acts, ctx, excess),
      reason:
        `${span}に${total}回算定されています（${rule.max}回まで）。` +
        (dates.length ? `当月の算定日：${dates.map(md).join("、")}。` : "") +
        (detail.length ? `過去分：${detail.join("、")}。` : ""),
    },
  ];
}

// ---------- 2. 併算定不可 ----------
function checkExclusive(rule: ExclusiveRule, rec: ParsedReceipt, ctx: Ctx): Draft[] {
  const as = rec.acts.filter((a) => matches(a, rule.a));
  const bs = rec.acts.filter((a) => matches(a, rule.b));
  if (!as.length || !bs.length) return [];
  for (const b of bs) {
    for (const a of as) {
      if (a === b) continue;
      if (rule.sameTooth && !a.teeth.some((t) => b.teeth.map(toothOf).includes(toothOf(t)))) continue;
      let date: string | undefined;
      if (rule.scope === "day") {
        date = a.dates.find((d) => b.dates.includes(d));
        if (!date) continue;
      }
      return [
        {
          date: date ?? b.dates[0],
          tooth: toothLbl(b, ctx),
          itemCode: b.code,
          itemName: b.name,
          points: amount([b], ctx),
          reason: `「${a.name}」と「${b.name}」を${rule.scope === "day" ? `同日（${md(date!)}）` : "同月"}に算定しています。`,
        },
      ];
    }
  }
  return [];
}

// ---------- 3. 前提の検査・管理 ----------
function checkPrerequisite(rule: PrerequisiteRule, rec: ParsedReceipt, patient: ParsedReceipt[], ctx: Ctx): Draft[] {
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
      itemCode: t.code,
      itemName: t.name,
      points: targets.reduce((s, a) => s + unitPoints(a, ctx.master) * a.count, 0),
      reason: `${range}に前提となる「${label(rule.required)}」の算定がありません${rule.mustPrecede ? "（算定日より前に必要）" : ""}。`,
    },
  ];
}

// ---------- 4. 病名・部位 ----------
function checkDiagnosis(rule: DiagnosisRule, rec: ParsedReceipt, ctx: Ctx): Draft[] {
  const acts = rec.acts.filter((a) => matches(a, rule.target));
  if (!acts.length) return [];
  const names = rule.diagnosis.names.map(norm);
  const abbrs = (rule.diagnosis.abbrs ?? []).map(norm);
  const diags = rec.diagnoses.filter(
    (d) =>
      rule.diagnosis.codes?.includes(d.code) ||
      names.some((w) => norm(d.baseName || d.name).includes(w)) ||
      (d.abbr && abbrs.includes(norm(d.abbr))),
  );
  const want = [...rule.diagnosis.names, ...(rule.diagnosis.abbrs ?? [])].join("／");
  const first = acts.flatMap((a) => a.dates).sort()[0];

  if (!diags.length) {
    return [
      {
        date: first,
        itemCode: acts[0].code,
        itemName: acts[0].name,
        points: acts.reduce((s, a) => s + unitPoints(a, ctx.master) * a.count, 0),
        reason: `レセプトに「${want}」の病名がありません。`,
      },
    ];
  }

  // 病名の部位（歯）。口腔全体などのブロックや部位なしの病名があれば歯数は数えない
  const wholeMouth = diags.some((d) => d.teeth.length === 0 || d.teeth.some((t) => isBlock(toothOf(t))));
  const diagTeeth = new Set(diags.flatMap((d) => d.teeth.map(toothOf)));
  const out: Draft[] = [];

  if (rule.matchTooth && !wholeMouth) {
    for (const a of acts.filter((x) => x.teeth.length)) {
      const missing = a.teeth.filter((t) => !diagTeeth.has(toothOf(t)));
      if (!missing.length) continue;
      out.push({
        date: a.dates[0],
        tooth: toothLbl(a, ctx),
        itemCode: a.code,
        itemName: a.name,
        points: amount([a], ctx),
        reason: `${teethLabel(missing, ctx.master.shishiki)}に「${want}」の病名がありません。`,
      });
    }
  }

  if (rule.perTooth && !wholeMouth) {
    const count = acts.reduce((s, a) => s + a.count, 0);
    if (count > diagTeeth.size) {
      out.push({
        date: acts.flatMap((a) => a.dates).sort().at(-1),
        itemCode: acts[0].code,
        itemName: acts[0].name,
        points: amount(acts, ctx, count - diagTeeth.size),
        reason: `1歯につき算定する項目が${count}回ありますが、「${want}」の病名がある歯は${diagTeeth.size}歯（${teethLabel([...diagTeeth], ctx.master.shishiki)}）です。`,
      });
    }
  }
  return out;
}

// ---------- 5. 必須コメント ----------
function checkComment(rule: CommentRule, rec: ParsedReceipt, ctx: Ctx): Draft[] {
  const out: Draft[] = [];
  const codes = rule.comment.codes ?? [];
  const kws = (rule.comment.keywords ?? []).map(norm);
  const all = rec.acts.flatMap((a) => a.comments);
  for (const act of rec.acts.filter((a) => matches(a, rule.target))) {
    const pool = act.comments.length ? act.comments : all;
    const ok = pool.some((c) => {
      if (codes.includes(c.code)) return true;
      if (!codes.length && !kws.length) return true;
      const text = norm(`${c.text}${ctx.master.commentText.get(c.code) ?? ""}`);
      return kws.some((k) => text.includes(k));
    });
    if (ok) continue;
    out.push({
      date: act.dates[0],
      tooth: toothLbl(act, ctx),
      itemCode: act.code,
      itemName: act.name,
      points: amount([act], ctx),
      reason: pool.length ? "必要な内容のコメントが見当たりません。" : "コメントが付いていません。",
    });
  }
  return out;
}

// ---------- 6. 施設基準 ----------
function checkFacility(rule: FacilityRule, rec: ParsedReceipt, ctx: Ctx): Draft[] {
  const standards = rule.standard.split(",").map((s) => s.trim()).filter(Boolean);
  const filed = new Set(ctx.filed);
  for (const t of rec.todokede) for (const c of TODOKEDE_TO_FACILITY[t] ?? []) filed.add(c);
  const isFiled = standards.some((s) => filed.has(s));
  const stdName = standards.map(facilityNameOf).join("／");

  if (rule.mode === "required") {
    if (isFiled || ctx.filed.size === 0) return [];
    return rec.acts
      .filter((a) => matches(a, rule.target))
      .map((act) => ({
        date: act.dates[0],
        itemCode: act.code,
        itemName: act.name,
        points: amount([act], ctx),
        reason: `「${stdName}」の届出が登録されていないのに算定しています。`,
      }));
  }

  if (!isFiled) return [];
  const whens = rec.acts.filter((a) => matches(a, rule.when));
  if (!whens.length) return [];
  if (rec.acts.some((a) => matches(a, rule.expect))) return [];
  let expectName = label(rule.expect ?? {}) || stdName;
  let expectPoints = rule.expectPoints ?? 0;
  const code = rule.expect?.codes?.[0];
  const e = code ? ctx.master.shinryo.get(code) : [...ctx.master.shinryo.values()].find((x) => matches(x, rule.expect));
  if (e) {
    expectName = e.name;
    expectPoints = e.points || expectPoints;
  }
  const times = Math.max(1, whens.reduce((s, a) => s + (a.dates.length || a.count), 0));
  return [
    {
      date: whens.flatMap((a) => a.dates).sort().at(-1),
      itemCode: e?.code,
      itemName: expectName,
      points: expectPoints * times,
      reason: `「${stdName}」は届出済みですが、「${whens[0].name || whens[0].code}」に「${expectName}」が付いていません（${times}回分）。`,
    },
  ];
}

// ---------- サマリー ----------
export function summarize(findings: Pick<Finding, "status" | "category" | "impact" | "month" | "receiptNo" | "amountYen">[], receiptCount: number): AuditSummary {
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
