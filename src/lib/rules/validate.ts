import type { CheckCategory, Impact } from "../types";
import { KIND_TO_CATEGORY, type ItemRef, type Rule } from "./types";

const IMPACTS: Impact[] = ["henrei", "satei", "more"];

function ref(v: unknown, label: string): ItemRef {
  const r = (v ?? {}) as ItemRef;
  const names = Array.isArray(r.names) ? r.names.filter((x) => typeof x === "string" && x.trim()) : [];
  const codes = Array.isArray(r.codes) ? r.codes.filter((x) => typeof x === "string" && x.trim()) : [];
  if (!names.length && !codes.length) throw new Error(`${label}の名称かコードを1つ以上指定してください`);
  const out: ItemRef = {};
  if (names.length) out.names = names;
  if (codes.length) out.codes = codes;
  if (Array.isArray(r.excludeNames) && r.excludeNames.length) out.excludeNames = r.excludeNames.filter((x) => typeof x === "string");
  return out;
}

function str(v: unknown, label: string): string {
  if (typeof v !== "string" || !v.trim()) throw new Error(`${label}を入力してください`);
  return v.trim();
}

function int(v: unknown, label: string, min = 0): number {
  const n = Number(v);
  if (!Number.isInteger(n) || n < min) throw new Error(`${label}は${min}以上の整数にしてください`);
  return n;
}

/** 画面や AI から来たルールを検査して正規化する（不正なら例外） */
export function validateRule(input: unknown): Rule {
  const r = (input ?? {}) as Record<string, unknown>;
  const kind = r.kind as Rule["kind"];
  if (!(kind in KIND_TO_CATEGORY)) throw new Error("種類（kind）が不正です");
  const impact = r.impact as Impact;
  if (!IMPACTS.includes(impact)) throw new Error("影響（impact）が不正です");
  const base = {
    id: typeof r.id === "string" && /^[\w-]+$/.test(r.id) ? r.id : `rule-${Math.random().toString(36).slice(2, 10)}`,
    name: str(r.name, "ルール名"),
    category: KIND_TO_CATEGORY[kind] as CheckCategory,
    impact,
    enabled: r.enabled !== false,
    priority: Number.isFinite(Number(r.priority)) ? Number(r.priority) : 999,
    basis: str(r.basis, "根拠"),
    fix: str(r.fix, "直し方"),
    source: (["builtin", "ai", "manual"].includes(r.source as string) ? r.source : "manual") as Rule["source"],
    historyCount: typeof r.historyCount === "number" ? r.historyCount : undefined,
    note: typeof r.note === "string" ? r.note : undefined,
  };

  switch (kind) {
    case "frequency": {
      const per = r.per as "day" | "month" | "months";
      if (!["day", "month", "months"].includes(per)) throw new Error("期間（per）が不正です");
      return {
        ...base,
        kind,
        target: ref(r.target, "対象"),
        max: int(r.max, "上限回数", 1),
        per,
        months: per === "months" ? int(r.months, "月数", 1) : undefined,
        perTooth: r.perTooth === true,
      };
    }
    case "exclusive":
      if (!["day", "month"].includes(r.scope as string)) throw new Error("範囲（scope）が不正です");
      return { ...base, kind, a: ref(r.a, "項目A"), b: ref(r.b, "項目B"), scope: r.scope as "day" | "month", sameTooth: r.sameTooth === true };
    case "prerequisite":
      return {
        ...base,
        kind,
        target: ref(r.target, "対象"),
        required: ref(r.required, "前提"),
        lookbackMonths: int(r.lookbackMonths, "さかのぼる月数"),
        mustPrecede: r.mustPrecede === true,
      };
    case "diagnosis": {
      const d = (r.diagnosis ?? {}) as { names?: string[]; codes?: string[] };
      const names = (d.names ?? []).filter((x) => typeof x === "string" && x.trim());
      if (!names.length && !d.codes?.length) throw new Error("必要な病名を1つ以上指定してください");
      return { ...base, kind, target: ref(r.target, "対象"), diagnosis: { names, codes: d.codes }, matchTooth: r.matchTooth !== false };
    }
    case "comment": {
      const c = (r.comment ?? {}) as { codes?: string[]; keywords?: string[] };
      return { ...base, kind, target: ref(r.target, "対象"), comment: { codes: c.codes ?? [], keywords: c.keywords ?? [] } };
    }
    case "facility": {
      const mode = r.mode as "required" | "missed";
      if (mode === "required") {
        return { ...base, kind, standard: str(r.standard, "施設基準名"), mode, target: ref(r.target, "対象") };
      }
      if (mode === "missed") {
        return {
          ...base,
          kind,
          standard: str(r.standard, "施設基準名"),
          mode,
          when: ref(r.when, "きっかけの項目"),
          expect: ref(r.expect, "取れるはずの項目"),
          expectPoints: typeof r.expectPoints === "number" ? r.expectPoints : undefined,
        };
      }
      throw new Error("施設基準ルールの mode は required か missed にしてください");
    }
  }
}
