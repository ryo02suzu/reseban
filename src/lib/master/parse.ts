import { decodeUke, splitCsv } from "../uke/text";
import type { MasterKind } from "../types";

export interface MasterEntry {
  code: string;
  name: string;
  points?: number;
}

/**
 * 支払基金の各種マスター（CSV）を読む。
 *
 * 【要確認】マスターごとに列構成が違うため、列番号を決め打ちせず
 *   コード = 3列目以降で最初の 4〜10 桁の数字
 *   名称   = コードより後で最初に日本語を含む列
 *   点数   = 診療行為マスターのみ、POINTS_COLUMN 列目（数値のとき）
 * で拾う。取込件数と数件のサンプルを画面に出して目視確認できるようにしている。
 */
const POINTS_COLUMN = 11;

const JP = /[぀-ヿ㐀-鿿＀-￯]/;

export function parseMaster(buf: ArrayBuffer | Uint8Array, kind: MasterKind): MasterEntry[] {
  const text = decodeUke(buf);
  const out: MasterEntry[] = [];
  for (const line of text.split(/\r?\n/)) {
    if (!line.trim()) continue;
    const f = splitCsv(line).map((v) => v.trim());
    let ci = -1;
    for (let i = 2; i < f.length; i++) {
      if (/^\d{4,10}$/.test(f[i])) {
        ci = i;
        break;
      }
    }
    if (ci < 0) continue;
    const ni = f.findIndex((v, i) => i > ci && JP.test(v));
    if (ni < 0) continue;
    const entry: MasterEntry = { code: f[ci], name: f[ni] };
    if (kind === "shinryo") {
      const p = Number(f[POINTS_COLUMN]);
      if (f[POINTS_COLUMN] !== "" && Number.isFinite(p)) entry.points = p;
    }
    out.push(entry);
  }
  return out;
}
