/**
 * 支払基金「基本マスター」（令和8年版）を取り込んだ結果。
 * 取込は運営者がまとめて行い、全医院で共有する。
 */

export type MasterKind =
  | "shinryo" // 歯科診療行為マスター 基本テーブル
  | "limit" // 算定回数限度テーブル
  | "age" // 年齢制限テーブル
  | "exclusive" // 併算定背反テーブル
  | "commentRel" // コメント関連テーブル
  | "byomei" // 傷病名マスター
  | "shushokugo" // 修飾語マスター
  | "shishiki" // 歯式マスター
  | "comment"; // コメントマスター

export const MASTER_KINDS: { kind: MasterKind; label: string; file: string; required: boolean }[] = [
  { kind: "shinryo", label: "歯科診療行為マスター（基本テーブル）", file: "h_ALL*.csv", required: true },
  { kind: "limit", label: "算定回数限度テーブル", file: "h-6_ALL*.csv", required: true },
  { kind: "exclusive", label: "併算定背反テーブル", file: "h-9_ALL*.csv", required: true },
  { kind: "age", label: "年齢制限テーブル", file: "h-8_ALL*.csv", required: false },
  { kind: "commentRel", label: "コメント関連テーブル", file: "ck_ALL_*.zip", required: true },
  { kind: "byomei", label: "傷病名マスター", file: "b_*.zip", required: true },
  { kind: "shushokugo", label: "修飾語マスター", file: "z_*.zip", required: false },
  { kind: "shishiki", label: "歯式マスター", file: "f_*.csv", required: false },
  { kind: "comment", label: "コメントマスター", file: "c_ALL*.zip", required: false },
];

export interface ShinryoEntry {
  code: string;
  /** 加算コード（加算項目のとき。基本項目は空） */
  kasan: string;
  name: string;
  short: string;
  points: number;
  /** 点数等識別（3=点数 など） */
  pointsType: string;
  /** レセプト「届出」欄に関係（1=補管, 17=歯初診, 0=なし） */
  todokede: string;
  /** 算定に必要な施設基準コード（いずれか） */
  facility: string[];
  /** 公表順序（区分番号順に並べる用） */
  kubun: string;
}

/** 算定単位コード（別紙4-1）のうち点検に使うもの */
export type LimitUnit = "day" | "week" | "month" | "months" | "fiscalYear" | "patient";

export interface LimitEntry {
  code: string;
  unitCode: string;
  unit: LimitUnit;
  /** unit=months のときの月数 */
  months?: number;
  max: number;
}

export interface AgeEntry {
  code: string;
  /** 算定できる下限（この年齢以上）。null=制限なし */
  lower: number | null;
  /** 算定できる上限+1（この年齢未満）。null=制限なし */
  upper: number | null;
  /** 特殊コード（AA=生後28日, B3/BF=〇歳に達した日の翌月1日） */
  lowerRaw: string;
  upperRaw: string;
}

export interface ExclusiveEntry {
  code: string;
  other: string;
  /** 0=算定不可, 2=どちらか一方 */
  kahi: "0" | "2";
}

export interface CommentRequirement {
  code: string;
  /** 記載要領別表Ⅰの項番＋枝番。グループごとに最低1つ必要 */
  group: string;
  commentCode: string;
  text: string;
  /** 適用期間 YYYYMMDD（変更年月日〜廃止年月日） */
  from: string;
  to: string;
}

export interface MasterData {
  shinryo: ShinryoEntry[];
  limit: LimitEntry[];
  age: AgeEntry[];
  exclusive: ExclusiveEntry[];
  commentRel: CommentRequirement[];
  byomei: { code: string; name: string; abbr: string }[];
  shushokugo: { code: string; name: string }[];
  shishiki: { code: string; name: string }[];
  comment: { code: string; text: string }[];
}

export interface MasterFileStatus {
  kind: MasterKind;
  count: number;
  fileName: string;
  importedAt: string;
}
