/**
 * 紙レセプトの手入力。
 * 氏名・保険者番号・記号番号・生年月日の欄は作らない（年齢と、院内で探すための患者IDだけ）。
 */
export interface PaperDiagnosis {
  /** 部位（「右下6」「46」「上顎」など。空なら部位なし） */
  teeth: string;
  /** 傷病名または略称（「C」「Pul」「P」「歯周炎」など） */
  name: string;
}

export interface PaperAct {
  /** 算定日（「3,10」のように日にちをカンマ区切り。空なら日付なし） */
  days: string;
  /** 項目名（マスターの候補から選ぶとコードが入る） */
  name: string;
  code?: string;
  /** 回数（空なら日付の数、日付もなければ1） */
  count?: number;
  teeth: string;
  comment: string;
}

export interface PaperReceiptInput {
  /** 診療年月 YYYYMM */
  month: string;
  /** 院内で探すための患者ID（カルテ番号など）。月をまたいだ点検にも使う */
  patientId: string;
  sex: "1" | "2" | "";
  age: number | null;
  diagnoses: PaperDiagnosis[];
  acts: PaperAct[];
  memo: string;
}

export interface PaperReceipt extends PaperReceiptInput {
  id: string;
  /** 月ごとの通し番号（レポートのレセプト番号として表示する） */
  no: number;
  updatedAt: string;
}

export const emptyPaper = (month: string): PaperReceiptInput => ({
  month,
  patientId: "",
  sex: "",
  age: null,
  diagnoses: [{ teeth: "", name: "" }],
  acts: [{ days: "", name: "", teeth: "", comment: "" }],
  memo: "",
});

const str = (v: unknown, max: number) => (typeof v === "string" ? v.trim().slice(0, max) : "");

/** 画面から来た値を整える。問題があれば日本語の理由を返す */
export function normalizePaper(v: unknown): { value?: PaperReceiptInput; error?: string } {
  const o = (v ?? {}) as Record<string, unknown>;
  const month = str(o.month, 6);
  if (!/^20\d{2}(0[1-9]|1[0-2])$/.test(month)) return { error: "診療年月を正しく入れてください" };
  const patientId = str(o.patientId, 30);
  if (!patientId) return { error: "患者ID（カルテ番号など）を入れてください。月をまたいだ点検に使います" };
  const age = o.age === null || o.age === "" || o.age === undefined ? null : Number(o.age);
  if (age !== null && (!Number.isInteger(age) || age < 0 || age > 120)) return { error: "年齢は0〜120で入れてください" };
  const sex = o.sex === "1" || o.sex === "2" ? o.sex : "";
  const diagnoses = (Array.isArray(o.diagnoses) ? o.diagnoses : [])
    .slice(0, 40)
    .map((d: Record<string, unknown>) => ({ teeth: str(d?.teeth, 100), name: str(d?.name, 100) }))
    .filter((d) => d.name);
  const acts = (Array.isArray(o.acts) ? o.acts : [])
    .slice(0, 80)
    .map((a: Record<string, unknown>) => {
      const count = a?.count === "" || a?.count === undefined || a?.count === null ? undefined : Number(a.count);
      return {
        days: str(a?.days, 100),
        name: str(a?.name, 100),
        code: /^\d{9}$/.test(str(a?.code, 9)) ? str(a?.code, 9) : undefined,
        count: count !== undefined && Number.isInteger(count) && count > 0 && count < 1000 ? count : undefined,
        teeth: str(a?.teeth, 100),
        comment: str(a?.comment, 200),
      };
    })
    .filter((a) => a.name || a.code);
  if (!acts.length) return { error: "診療行為を1つ以上入れてください" };
  for (const a of acts) {
    const bad = parseDays(a.days).bad;
    if (bad.length) return { error: `算定日「${bad.join("、")}」が読めません（例：3,10,17）` };
  }
  return { value: { month, patientId, sex, age, diagnoses, acts, memo: str(o.memo, 500) } };
}

/** 「3,10,17」「3・10」「3-5」→ 日にち */
export function parseDays(s: string): { days: number[]; bad: string[] } {
  const days: number[] = [];
  const bad: string[] = [];
  for (const t of s.normalize("NFKC").split(/[\s,、・/]+/).filter(Boolean)) {
    const m = /^(\d{1,2})日?(?:[-~〜](\d{1,2})日?)?$/.exec(t);
    if (!m) {
      bad.push(t);
      continue;
    }
    const a = Number(m[1]);
    const b = Number(m[2] ?? m[1]);
    if (a < 1 || a > 31 || b < 1 || b > 31 || b < a) {
      bad.push(t);
      continue;
    }
    for (let d = a; d <= b; d++) days.push(d);
  }
  return { days, bad };
}
