// ドメイン型。UI・パーサー・ルールエンジン・保存層で共有する。

/** チェックの6分類 */
export type CheckCategory =
  | "frequency" // 回数・間隔オーバー
  | "exclusive" // 一緒に取れない組み合わせ
  | "prerequisite" // 前提の検査・管理がない
  | "diagnosis" // 病名・部位と処置のズレ
  | "comment" // 必須コメントの漏れ
  | "facility"; // 施設基準のズレ

export const CATEGORY_LABELS: Record<CheckCategory, string> = {
  frequency: "回数・間隔オーバー",
  exclusive: "併算定不可",
  prerequisite: "前提の検査・管理なし",
  diagnosis: "病名・部位のズレ",
  comment: "必須コメント漏れ",
  facility: "施設基準のズレ",
};

export const CATEGORY_ORDER: CheckCategory[] = [
  "frequency",
  "exclusive",
  "prerequisite",
  "diagnosis",
  "comment",
  "facility",
];

/** 指摘がどういう損失につながるか */
export type Impact =
  | "henrei" // 返戻リスク（件数で数える）
  | "satei" // 査定リスク（円）
  | "more"; // 算定漏れ（円）

export const IMPACT_LABELS: Record<Impact, string> = {
  henrei: "返戻リスク",
  satei: "査定リスク",
  more: "算定漏れ",
};

export type FindingStatus = "open" | "fixed" | "ignored";

export const STATUS_LABELS: Record<FindingStatus, string> = {
  open: "未対応",
  fixed: "対応済み",
  ignored: "問題なし",
};

/** 1件の指摘 */
export interface Finding {
  id: string;
  ruleId: string;
  ruleName: string;
  category: CheckCategory;
  impact: Impact;
  /** 医療機関内で患者を探すための番号（氏名は保持しない） */
  karteNo: string;
  receiptNo: string;
  /** 診療年月 YYYYMM */
  month: string;
  /** 対象日（分かる場合）YYYY-MM-DD */
  date?: string;
  tooth?: string;
  itemCode?: string;
  itemName?: string;
  points: number;
  /** 影響額（円）= 点数 × 10 */
  amountYen: number;
  reason: string;
  basis: string;
  fix: string;
  status: FindingStatus;
  memo?: string;
  aiExplanation?: string;
}

export interface AiSuggestion {
  id: string;
  karteNo: string;
  receiptNo: string;
  itemName: string;
  estimatedPoints: number;
  rationale: string;
  status: "open" | "accepted" | "rejected";
}

export interface AuditSummary {
  receiptCount: number;
  henreiCount: number;
  sateiYen: number;
  moreYen: number;
  byCategory: Record<CheckCategory, number>;
}

/** 1回のチェック実行 */
export interface AuditRun {
  id: string;
  createdAt: string;
  /** 請求対象の診療年月 YYYYMM */
  targetMonth: string;
  clinicName: string;
  clinicCode: string;
  historyMonths: string[];
  summary: AuditSummary;
  findings: Finding[];
  suggestions: AiSuggestion[];
  warnings: string[];
  demo?: boolean;
}

export type AuditRunListItem = Omit<AuditRun, "findings" | "suggestions">;

/** 施設基準の届出状況 */
export interface FacilityStandard {
  name: string;
  filed: boolean;
}

export type MasterKind = "shinryo" | "byomei" | "shishiki" | "comment";

export const MASTER_LABELS: Record<MasterKind, string> = {
  shinryo: "歯科診療行為マスター",
  byomei: "傷病名マスター",
  shishiki: "歯式マスター",
  comment: "コメントマスター",
};

export interface MasterStatus {
  kind: MasterKind;
  count: number;
  importedAt?: string;
  fileName?: string;
  demo?: boolean;
}

export interface Settings {
  clinicName: string;
  clinicCode: string;
  facilityStandards: FacilityStandard[];
  aiEnabled: boolean;
}
