/**
 * 歯式コード（歯式マスター）
 *   6桁 = 歯種コード4桁 + 状態コード1桁 + 部分コード1桁
 *   歯種 = "10" + 象限 + 歯番号
 *     象限 1=右上 2=左上 3=左下 4=右下（永久歯） / 5〜8 = 同じ並びの乳歯
 *     歯番号 1〜8（乳歯は1〜5=A〜E）、A〜H は過剰歯などの位置
 *   "1000"〜"1009" は口腔全体・上顎・下顎などのブロック
 */

const QUAD: Record<string, string> = {
  "1": "右上",
  "2": "左上",
  "3": "左下",
  "4": "右下",
  "5": "右上",
  "6": "左上",
  "7": "左下",
  "8": "右下",
};
const PRIMARY = ["", "A", "B", "C", "D", "E"];

/** 6桁の歯式コード列（連結）を分割 */
export function splitToothCodes(s: string | undefined): string[] {
  const v = (s ?? "").trim();
  const out: string[] = [];
  for (let i = 0; i + 6 <= v.length; i += 6) out.push(v.slice(i, i + 6));
  return out;
}

/** 歯式コード → 歯種（4桁）。同じ歯かどうかの比較に使う */
export function toothOf(code: string): string {
  return code.slice(0, 4);
}

/** ブロック（口腔全体・顎単位）なら true */
export function isBlock(tooth: string): boolean {
  return /^100\d$/.test(tooth);
}

/** 歯種（4桁）を「右下6」「左上E」のように */
export function toothLabel(tooth: string, names?: Map<string, string>): string {
  const t = tooth.slice(0, 4);
  const m = /^10([1-8])([1-8A-H])$/.exec(t);
  if (m) {
    const [, q, n] = m;
    if (/[A-H]/.test(n)) return `${QUAD[q]}${Number(q) >= 5 ? "乳歯部" : ""}過剰歯等(${n})`;
    return `${QUAD[q]}${Number(q) >= 5 ? PRIMARY[Number(n)] ?? n : n}`;
  }
  const byMaster = names?.get(`${t}10`) ?? names?.get(`${t}00`);
  if (byMaster) return byMaster.replace(/部分指定なし$/, "").replace(/現存歯$|部（部を示す場合に使用）$/, "");
  return t;
}

export function teethLabel(teeth: string[], names?: Map<string, string>): string {
  return [...new Set(teeth.map((t) => t.slice(0, 4)))].map((t) => toothLabel(t, names)).join("・");
}
