import type { ItemRef, Rule } from "./types";
import { facilityNameOf } from "./facility";

const std = (s: string) => s.split(",").map((c) => `${facilityNameOf(c.trim())}（${c.trim()}）`).join("／");

function items(ref?: ItemRef) {
  if (!ref) return "（未設定）";
  const parts = [...(ref.names ?? []).map((n) => `「${n}」`), ...(ref.codes ?? []).map((c) => `コード${c}`)];
  const s = parts.join("または");
  return ref.excludeNames?.length ? `${s}（${ref.excludeNames.join("・")}を含むものは除く）` : s;
}

/** ルールの条件を日本語の箇条書きにする */
const OFFICIAL_DESC: Record<string, string> = {
  limit: "支払基金の算定回数限度テーブルで上限が決まっている項目の回数を確認",
  exclusive: "支払基金の併算定背反テーブルにある組み合わせを同月に算定していないか確認",
  age: "支払基金の年齢制限テーブルで算定できる年齢が決まっている項目を確認",
  comment: "記載要領別表Ⅰで算定時に記録が必要なコメントがあるか確認",
  facility: "施設基準が必要な項目を、届出なしで算定していないか確認",
};

export function describeRule(r: Rule): string[] {
  switch (r.kind) {
    case "official":
      return [OFFICIAL_DESC[r.table]];
    case "frequency": {
      const span = r.per === "day" ? "同じ日に" : r.per === "month" ? "同じ月に" : `${r.months}ヶ月の間に`;
      return [`${items(r.target)}を${span}${r.max}回を超えて算定${r.perTooth ? "（歯ごとに数える）" : ""}`];
    }
    case "exclusive":
      return [
        `${items(r.a)}と${items(r.b)}を${r.scope === "day" ? "同じ日" : "同じ月"}に算定`,
        ...(r.sameTooth ? ["同じ歯の場合のみ"] : []),
      ];
    case "prerequisite":
      return [
        `${items(r.target)}を算定`,
        `${r.lookbackMonths === 0 ? "同じ月" : `過去${r.lookbackMonths}ヶ月（当月含む）`}に${items(r.required)}がない${r.mustPrecede ? "（算定日より前に必要）" : ""}`,
      ];
    case "diagnosis":
      return [
        `${items(r.target)}を算定`,
        `レセプトに「${[...r.diagnosis.names, ...(r.diagnosis.abbrs ?? [])].join("」「")}」のいずれの病名もない`,
        ...(r.perTooth ? ["または、算定回数がその病名の付いた歯数を超える（1歯につき算定する項目）"] : []),
        ...(r.matchTooth ? ["コメントの歯式で部位が分かる場合は、その歯の病名も確認"] : []),
      ];
    case "comment":
      return [
        `${items(r.target)}を算定`,
        r.comment.keywords?.length || r.comment.codes?.length
          ? `「${[...(r.comment.keywords ?? []), ...(r.comment.codes ?? [])].join("」「")}」を含むコメントがない`
          : "コメントが1つもない",
      ];
    case "facility":
      return r.mode === "required"
        ? [`施設基準「${std(r.standard)}」の届出が無いのに`, `${items(r.target)}を算定`]
        : [`施設基準「${std(r.standard)}」の届出がある`, `${items(r.when)}を算定したのに${items(r.expect)}が無い（算定漏れ）`];
  }
}
