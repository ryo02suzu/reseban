import type { ItemRef, Rule } from "./types";

function items(ref?: ItemRef) {
  if (!ref) return "（未設定）";
  const parts = [...(ref.names ?? []).map((n) => `「${n}」`), ...(ref.codes ?? []).map((c) => `コード${c}`)];
  const s = parts.join("または");
  return ref.excludeNames?.length ? `${s}（${ref.excludeNames.join("・")}を含むものは除く）` : s;
}

/** ルールの条件を日本語の箇条書きにする */
export function describeRule(r: Rule): string[] {
  switch (r.kind) {
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
      return [`${items(r.target)}を算定`, `${r.matchTooth ? "その部位に" : "レセプトに"}「${r.diagnosis.names.join("」「")}」のいずれの病名もない`];
    case "comment":
      return [
        `${items(r.target)}を算定`,
        r.comment.keywords?.length || r.comment.codes?.length
          ? `「${[...(r.comment.keywords ?? []), ...(r.comment.codes ?? [])].join("」「")}」を含むコメントがない`
          : "コメントが1つもない",
      ];
    case "facility":
      return r.mode === "required"
        ? [`「${r.standard}」の届出が無いのに`, `${items(r.target)}を算定`]
        : [`「${r.standard}」の届出がある`, `${items(r.when)}を算定したのに${items(r.expect)}が無い（算定漏れ）`];
  }
}
