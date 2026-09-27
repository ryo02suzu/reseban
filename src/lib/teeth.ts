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

const QUAD_OF: Record<string, number> = { 右上: 1, 左上: 2, 左下: 3, 右下: 4 };
const BLOCKS: [RegExp, string][] = [
  [/^(全顎|口腔全体|全部)$/, "1000"],
  [/^(上顎|上顎歯列)$/, "1001"],
  [/^(下顎|下顎歯列)$/, "1002"],
  [/^(右上臼歯|右側上顎臼歯)部?$/, "1003"],
  [/^(上顎前歯|上前歯)部?$/, "1004"],
  [/^(左上臼歯|左側上顎臼歯)部?$/, "1005"],
  [/^(左下臼歯|左側下顎臼歯)部?$/, "1006"],
  [/^(下顎前歯|下前歯)部?$/, "1007"],
  [/^(右下臼歯|右側下顎臼歯)部?$/, "1008"],
];
const PRIMARY_NO: Record<string, number> = { A: 1, B: 2, C: 3, D: 4, E: 5 };

/**
 * 手入力の部位を歯式コード（6桁、現存歯・部分指定なし）にする。
 *   「右下6」「右下5-7」「右上E」「46」「46,47」「上顎」「全顎」など。読めなかった語は bad に入れる。
 */
export function parseTeethInput(input: string): { codes: string[]; bad: string[] } {
  const codes: string[] = [];
  const bad: string[] = [];
  const add = (tooth4: string) => {
    const c = `${tooth4}00`;
    if (!codes.includes(c)) codes.push(c);
  };
  const tokens = input
    .normalize("NFKC")
    .replace(/[～〜~ー―－]/g, "-")
    .split(/[\s,、・/]+/)
    .filter(Boolean);
  for (const raw of tokens) {
    const t = raw.replace(/番$/, "");
    const block = BLOCKS.find(([re]) => re.test(t));
    if (block) {
      add(block[1]);
      continue;
    }
    const m = /^(右上|左上|左下|右下)([1-8A-Ea-e])(?:-([1-8A-Ea-e]))?$/.exec(t);
    if (m) {
      const q = QUAD_OF[m[1]];
      const a = m[2].toUpperCase();
      const b = (m[3] ?? m[2]).toUpperCase();
      const primary = /[A-E]/.test(a);
      if (primary !== /[A-E]/.test(b)) {
        bad.push(raw);
        continue;
      }
      const from = primary ? PRIMARY_NO[a] : Number(a);
      const to = primary ? PRIMARY_NO[b] : Number(b);
      for (let n = Math.min(from, to); n <= Math.max(from, to); n++) add(`10${primary ? q + 4 : q}${n}`);
      continue;
    }
    // FDI（46 など。51〜85 は乳歯）
    const f = /^([1-8])([1-8])$/.exec(t);
    if (f && (Number(f[1]) <= 4 || Number(f[2]) <= 5)) {
      add(`10${f[1]}${f[2]}`);
      continue;
    }
    bad.push(raw);
  }
  return { codes, bad };
}
