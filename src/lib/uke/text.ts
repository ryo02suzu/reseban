// ブラウザでもサーバーでも使える文字列処理（Node 依存なし）
import { LAYOUT } from "./layout";

const ERA_BASE: Record<string, number> = { "1": 1867, "2": 1911, "3": 1925, "4": 1988, "5": 2018 };

/** 和暦 GYYMM / GYYMMDD、西暦 YYYYMM / YYYYMMDD を西暦 YYYYMM(DD) に */
export function toSeireki(v: string): string {
  const s = (v ?? "").trim();
  if (/^\d{6}$/.test(s) || /^\d{8}$/.test(s)) return s;
  if (/^[1-5]\d{4}(\d{2})?$/.test(s)) {
    const y = ERA_BASE[s[0]] + Number(s.slice(1, 3));
    return `${y}${s.slice(3)}`;
  }
  return "";
}

/** UTF-8 として読めなければ Shift_JIS として読む */
export function decodeUke(buf: ArrayBuffer | Uint8Array): string {
  const bytes = buf instanceof Uint8Array ? buf : new Uint8Array(buf);
  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  } catch {
    return new TextDecoder("shift_jis").decode(bytes);
  }
}

/** CSV 1行を分割（レセ電はダブルクォートを使わないが、念のため対応） */
export function splitCsv(line: string): string[] {
  if (!line.includes('"')) return line.split(",");
  const out: string[] = [];
  let cur = "";
  let q = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (q) {
      if (c === '"' && line[i + 1] === '"') {
        cur += '"';
        i++;
      } else if (c === '"') q = false;
      else cur += c;
    } else if (c === '"') q = true;
    else if (c === ",") {
      out.push(cur);
      cur = "";
    } else cur += c;
  }
  out.push(cur);
  return out;
}

/** ファイル先頭から診療年月を推定（画面でファイルを選んだ時の表示用） */
export function detectMonth(text: string): string | undefined {
  const counts = new Map<string, number>();
  for (const line of text.split(/\r?\n/)) {
    if (!line.startsWith("RE,")) continue;
    const m = toSeireki(splitCsv(line)[LAYOUT.RE.month]);
    if (m) counts.set(m, (counts.get(m) ?? 0) + 1);
  }
  return [...counts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0];
}
