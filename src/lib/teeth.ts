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

/** FDI 表記（例 "46"）を「右下6」に。分からないコードはそのまま返す */
export function toothLabel(code: string): string {
  const m = /^([1-8])([1-8])$/.exec(code);
  if (!m) return code;
  const [, q, n] = m;
  const pos = Number(q) >= 5 ? PRIMARY[Number(n)] ?? n : n;
  return `${QUAD[q]}${pos}`;
}

export function teethLabel(codes: string[]): string {
  return codes.map(toothLabel).join("・");
}
