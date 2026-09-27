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
  source: "builtin" | "official" | "ai" | "manual";
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

/**
 * 病名・部位: target を算定したレセプトに、指定の病名があること。
 * レセ電の歯科診療行為には部位（歯）が記録されないため、部位の突き合わせは
 *  - matchTooth: コメントの歯式で部位が分かる場合だけ、その歯の病名を確認
 *  - perTooth:   「1歯につき」の項目で、算定回数が該当病名の歯数を超えていないか確認
 * で行う。
 */
export interface DiagnosisRule extends RuleBase {
  kind: "diagnosis";
  target: ItemRef;
  /** names は傷病名の部分一致、abbrs は歯科傷病名省略名称（Ｐ、Ｐｕｌ 等）の完全一致 */
  diagnosis: { codes?: string[]; names: string[]; abbrs?: string[] };
  matchTooth: boolean;
  perTooth?: boolean;
}

/** 必須コメント: target にコメントが付いていること */
export interface CommentRule extends RuleBase {
  kind: "comment";
  target: ItemRef;
  comment: { codes?: string[]; keywords?: string[] };
}

/**
 * 施設基準（standard は施設基準コード。カンマ区切りで「いずれか」）:
 *  required = 届出なしで target を算定していたら指摘
 *  missed   = 届出ありなのに、when を算定したレセで expect が無ければ算定漏れ
 * 「届出が必要な項目を届出なしで算定」は公式テーブル（official/facility）でも点検する。
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

/** 支払基金の公式テーブルによる点検（中身はマスターから作る。ここでは有効・無効と優先順位だけ持つ） */
export type OfficialTable = "limit" | "exclusive" | "age" | "comment" | "facility";

export interface OfficialRule extends RuleBase {
  kind: "official";
  table: OfficialTable;
}

export type Rule =
  | OfficialRule
  | FrequencyRule
  | ExclusiveRule
  | PrerequisiteRule
  | DiagnosisRule
  | CommentRule
  | FacilityRule;

export const OFFICIAL_CATEGORY: Record<OfficialTable, CheckCategory> = {
  limit: "frequency",
  exclusive: "exclusive",
  age: "prerequisite",
  comment: "comment",
  facility: "facility",
};

export const KIND_TO_CATEGORY: Record<Exclude<Rule["kind"], "official">, CheckCategory> = {
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

/** 返戻・査定の実績1件（増減点連絡書・返戻付箋などから） */
export interface ClaimHistoryRow {
  /** 行の識別子（画面から1件ずつ消すため） */
  id?: string;
  /** 診療年月 YYYYMM */
  month: string;
  kind: "henrei" | "satei";
  itemName: string;
  reason: string;
  points: number;
  /** カルテ番号・紙レセプトの患者ID（分かれば。答え合わせを患者単位で行う） */
  patientId?: string;
}

export interface RankingRow {
  label: string;
  count: number;
  points: number;
  ruleId?: string;
}
