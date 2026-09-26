import { unzipSync } from "fflate";
import { decodeUke, splitCsv } from "../uke/text";
import type {
  AgeEntry,
  CommentRequirement,
  ExclusiveEntry,
  LimitEntry,
  LimitUnit,
  MasterData,
  MasterKind,
  ShinryoEntry,
} from "./types";

/**
 * 支払基金の基本マスター（CSV、Shift_JIS、各項目を " で囲む）を読む。
 * 列位置の出典：「基本マスター ファイルレイアウト（令和8年版）」「コメント関連テーブル ファイル仕様説明書」
 */

/** ZIP なら中の最初の CSV/TXT を取り出す */
export function unpack(bytes: Uint8Array): Uint8Array {
  if (bytes[0] === 0x50 && bytes[1] === 0x4b) {
    const files = unzipSync(bytes);
    const name = Object.keys(files).find((n) => /\.(csv|txt)$/i.test(n)) ?? Object.keys(files)[0];
    if (!name) throw new Error("ZIPの中にファイルがありません");
    return files[name];
  }
  return bytes;
}

function rows(bytes: Uint8Array): string[][] {
  return decodeUke(unpack(bytes))
    .split(/\r?\n/)
    .filter((l) => l.trim())
    .map((l) => splitCsv(l).map((v) => v.trim()));
}

const num = (v: string | undefined) => {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
};

/** 算定単位コード（別紙4-1） */
const UNIT: Record<string, { unit: LimitUnit; months?: number }> = {
  "121": { unit: "day" },
  "138": { unit: "week" },
  "131": { unit: "month" },
  "143": { unit: "months", months: 2 },
  "144": { unit: "months", months: 3 },
  "145": { unit: "months", months: 4 },
  "146": { unit: "months", months: 6 },
  "147": { unit: "months", months: 12 },
  "161": { unit: "months", months: 24 },
  "148": { unit: "months", months: 60 },
  "162": { unit: "fiscalYear" },
  "053": { unit: "patient" },
};

export const UNIT_LABELS: Record<string, string> = {
  "121": "1日",
  "138": "1週",
  "131": "1月",
  "143": "2月",
  "144": "3月",
  "145": "4月",
  "146": "6月",
  "147": "12月",
  "161": "2年",
  "148": "5年",
  "162": "年度",
  "053": "患者当たり",
};

function expectKind(r: string[] | undefined, pos: number, value: string, label: string) {
  if (!r || r[pos] !== value) throw new Error(`${label}の形式ではありません（${pos + 1}列目が「${value}」ではありません）`);
}

export function parseShinryo(bytes: Uint8Array): ShinryoEntry[] {
  const rs = rows(bytes);
  expectKind(rs[0], 1, "H", "歯科診療行為マスター（基本テーブル）");
  return rs
    .filter((r) => r[1] === "H" && /^\d{9}$/.test(r[2]))
    .map((r) => ({
      code: r[2],
      kasan: r[7] && r[7] !== "00000" ? r[7] : "",
      kubun: `${r[3]}${r[4]}-${r[5]}`,
      name: r[8],
      short: r[9],
      pointsType: r[10],
      points: num(r[11]),
      todokede: r[25] ?? "0",
      facility: r.slice(35, 45).filter((c) => c && !/^0+$/.test(c)).map((c) => c.padStart(4, "0")),
    }));
}

export function parseLimit(bytes: Uint8Array): LimitEntry[] {
  const out: LimitEntry[] = [];
  for (const r of rows(bytes)) {
    if (!/^\d{9}$/.test(r[1] ?? "")) continue;
    const u = UNIT[r[9]];
    const max = num(r[10]);
    if (!u || max <= 0) continue;
    out.push({ code: r[1], unitCode: r[9], unit: u.unit, months: u.months, max });
  }
  if (!out.length) throw new Error("算定回数限度テーブルの形式ではありません");
  return out;
}

function ageValue(v: string): number | null {
  if (!v || v === "00") return null;
  if (/^\d{2}$/.test(v)) return Number(v);
  if (v === "B3") return 3;
  if (v === "BF") return 15;
  return null; // AA（生後28日）は月単位の点検では扱わない
}

export function parseAge(bytes: Uint8Array): AgeEntry[] {
  const out: AgeEntry[] = [];
  for (const r of rows(bytes)) {
    if (!/^\d{9}$/.test(r[1] ?? "")) continue;
    const lower = ageValue(r[9]);
    const upper = ageValue(r[10]);
    if (lower === null && upper === null) continue;
    out.push({ code: r[1], lower, upper, lowerRaw: r[9], upperRaw: r[10] });
  }
  return out;
}

export function parseExclusive(bytes: Uint8Array): ExclusiveEntry[] {
  const out: ExclusiveEntry[] = [];
  for (const r of rows(bytes)) {
    if (!/^\d{9}$/.test(r[1] ?? "")) continue;
    // 背反1〜10：算定可否・コード・区分・区分番号・枝番・項番・加算コード・基本名称・省略名称（9項目ずつ）
    for (let i = 0; i < 10; i++) {
      const base = 9 + i * 9;
      const kahi = r[base];
      const other = r[base + 1];
      if (!/^\d{9}$/.test(other ?? "")) continue;
      if (kahi === "0" || kahi === "2") out.push({ code: r[1], other, kahi });
    }
  }
  if (!out.length) throw new Error("併算定背反テーブルの形式ではありません");
  return out;
}

/** 歯科（コメント記載通知等=3）かつ「対象の診療行為の算定が条件で、それ以外の条件がない（01）」ものだけ */
export function parseCommentRel(bytes: Uint8Array): CommentRequirement[] {
  const out: CommentRequirement[] = [];
  for (const r of rows(bytes)) {
    if (r[1] !== "3") continue;
    if (!/^\d{9}$/.test(r[5] ?? "") || r[5] === "399999999") continue;
    if (r[13] !== "01" || r[14] === "1") continue;
    if (!/^\d{9}$/.test(r[8] ?? "")) continue;
    out.push({ code: r[5], group: `${r[2]}-${r[4]}`, commentCode: r[8], text: r[10], from: r[11] || "00000000", to: r[12] || "99999999" });
  }
  if (!out.length) throw new Error("コメント関連テーブルの形式ではありません（歯科の行が見つかりません）");
  return out;
}

export function parseByomei(bytes: Uint8Array) {
  const rs = rows(bytes);
  expectKind(rs[0], 1, "B", "傷病名マスター");
  return rs.filter((r) => r[1] === "B").map((r) => ({ code: r[2], name: r[5], abbr: r[38] ?? "" }));
}

export function parseShushokugo(bytes: Uint8Array) {
  const rs = rows(bytes);
  expectKind(rs[0], 1, "Z", "修飾語マスター");
  return rs.filter((r) => r[1] === "Z").map((r) => ({ code: r[2], name: r[6] }));
}

export function parseShishiki(bytes: Uint8Array) {
  const rs = rows(bytes);
  expectKind(rs[0], 1, "F", "歯式マスター");
  return rs.filter((r) => r[1] === "F").map((r) => ({ code: r[2], name: r[4] }));
}

export function parseCommentMaster(bytes: Uint8Array) {
  const rs = rows(bytes);
  expectKind(rs[0], 1, "C", "コメントマスター");
  return rs.filter((r) => r[1] === "C").map((r) => ({ code: `${r[2]}${r[3]}${r[4]}`, text: r[6] }));
}

export function parseMasterFile<K extends MasterKind>(kind: K, bytes: Uint8Array): MasterData[K] {
  const parsers: { [P in MasterKind]: (b: Uint8Array) => MasterData[P] } = {
    shinryo: parseShinryo,
    limit: parseLimit,
    age: parseAge,
    exclusive: parseExclusive,
    commentRel: parseCommentRel,
    byomei: parseByomei,
    shushokugo: parseShushokugo,
    shishiki: parseShishiki,
    comment: parseCommentMaster,
  };
  return parsers[kind](bytes);
}

/** ファイル名から種類を推定（運営画面でまとめて投げ込めるように） */
export function guessKind(fileName: string): MasterKind | null {
  const n = fileName.toLowerCase();
  if (/^h-6_/.test(n)) return "limit";
  if (/^h-8_/.test(n)) return "age";
  if (/^h-9_/.test(n)) return "exclusive";
  if (/^h_all/.test(n)) return "shinryo";
  if (/^ck_all/.test(n)) return "commentRel";
  if (/^c_all/.test(n)) return "comment";
  if (/^b_\d/.test(n)) return "byomei";
  if (/^z_\d/.test(n)) return "shushokugo";
  if (/^f_\d/.test(n)) return "shishiki";
  return null;
}
