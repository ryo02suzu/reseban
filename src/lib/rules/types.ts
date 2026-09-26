import type { CheckCategory, Impact } from "../types";

/**
 * 診療行為の指定方法。
 * codes はマスターのコードで完全一致、names はマスター名称の部分一致。
 * ルールは名称で書いておき、マスター取込時にコードへ解決できるようにする。
 */
export interface ItemRef {
  codes?: string[];
  names?: string[];
  /** names に一致しても除外する名称（部分一致） */
  excludeNames?: string[];
}

export interface RuleBase {
  id: string;
  name: string;
  category: CheckCategory;
  impact: Impact;
  enabled: boolean;
  /** 小さいほど優先（返戻・査定実績で並べ替える） */
  priority: number;
  /** 根拠（告示・通知・疑義解釈など） */
  basis: string;
  /** 直し方 */
  fix: string;
  source: "builtin" | "ai" | "manual";
  /** 過去1年の返戻・査定で該当した件数（実績取込で更新） */
  historyCount?: number;
  note?: string;
}

/** 回数・間隔: period 内で max 回まで */
export interface FrequencyRule extends RuleBase {
  kind: "frequency";
  target: ItemRef;
  max: number;
  /** day=同日, month=同月, months=当月を含む直近 months ヶ月 */
  per: "day" | "month" | "months";
  months?: number;
  perTooth?: boolean;
}

/** 併算定不可: a と b を同じ scope で算定していたら指摘（b を落とす想定） */
export interface ExclusiveRule extends RuleBase {
  kind: "exclusive";
  a: ItemRef;
  b: ItemRef;
  scope: "day" | "month";
  sameTooth?: boolean;
}

/** 前提: target の算定には required が lookbackMonths 以内（0=同月）に必要 */
export interface PrerequisiteRule extends RuleBase {
  kind: "prerequisite";
  target: ItemRef;
  required: ItemRef;
  lookbackMonths: number;
  /** required が target より前の日付であること */
  mustPrecede?: boolean;
}

/** 病名・部位: target を算定した歯に、指定の病名が付いていること */
export interface DiagnosisRule extends RuleBase {
  kind: "diagnosis";
  target: ItemRef;
  diagnosis: { codes?: string[]; names: string[] };
  matchTooth: boolean;
}

/** 必須コメント: target にコメントが付いていること */
export interface CommentRule extends RuleBase {
  kind: "comment";
  target: ItemRef;
  comment: { codes?: string[]; keywords?: string[] };
}

/**
 * 施設基準:
 *  required = 届出なしで target を算定していたら指摘
 *  missed   = 届出ありなのに、when を算定したレセで expect が無ければ算定漏れ
 */
export interface FacilityRule extends RuleBase {
  kind: "facility";
  standard: string;
  mode: "required" | "missed";
  target?: ItemRef;
  when?: ItemRef;
  expect?: ItemRef;
  /** マスターから点数が取れない時の見込み点数 */
  expectPoints?: number;
}

export type Rule =
  | FrequencyRule
  | ExclusiveRule
  | PrerequisiteRule
  | DiagnosisRule
  | CommentRule
  | FacilityRule;

export const KIND_TO_CATEGORY: Record<Rule["kind"], CheckCategory> = {
  frequency: "frequency",
  exclusive: "exclusive",
  prerequisite: "prerequisite",
  diagnosis: "diagnosis",
  comment: "comment",
  facility: "facility",
};

/** AI が作ったルール案（採用するまでエンジンには入らない） */
export interface RuleDraft {
  id: string;
  createdAt: string;
  sourceTitle: string;
  rule: Rule;
  aiRationale: string;
  status: "pending" | "adopted" | "rejected";
}

/** 返戻・査定の実績1件 */
export interface ClaimHistoryRow {
  month: string;
  kind: "henrei" | "satei";
  itemName: string;
  reason: string;
  points: number;
}

export interface RankingRow {
  label: string;
  count: number;
  points: number;
  ruleId?: string;
}
