import type { MasterIndex } from "../master/bundle";
import { UNIT_LABELS } from "../master/parse";
import type { Act, ParsedReceipt } from "../uke/types";
import type { OfficialTable } from "./types";
import { TODOKEDE_TO_FACILITY, facilityNameOf } from "./facility";

/** 公式テーブルによる点検の1件（engine が Finding に仕上げる） */
export interface OfficialDraft {
  date?: string;
  itemCode: string;
  itemName: string;
  points: number;
  reason: string;
}

export interface OfficialContext {
  rec: ParsedReceipt;
  /** 同じ患者の過去分（当月は含まない） */
  past: ParsedReceipt[];
  master: MasterIndex;
  filedFacility: Set<string>;
}

const md = (d: string) => `${Number(d.slice(5, 7))}/${Number(d.slice(8, 10))}`;

export function unitPoints(act: Act, master: MasterIndex): number {
  return act.points || master.shinryo.get(act.code)?.points || 0;
}

function nameOf(code: string, acts: Act[], master: MasterIndex) {
  return acts.find((a) => a.code === code && a.name)?.name || master.shinryo.get(code)?.name || code;
}

/** 当月のレセプト内の診療行為をコードごとにまとめる */
function byCode(acts: Act[]): Map<string, Act[]> {
  const m = new Map<string, Act[]>();
  for (const a of acts) {
    if (a.record !== "SS") continue;
    m.set(a.code, [...(m.get(a.code) ?? []), a]);
  }
  return m;
}

function monthsBack(ym: string, k: number): string {
  const y = Number(ym.slice(0, 4));
  const m = Number(ym.slice(4, 6)) - 1 - k;
  const d = new Date(Date.UTC(y, m, 1));
  return `${d.getUTCFullYear()}${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
}

function fiscalYear(ym: string) {
  const y = Number(ym.slice(0, 4));
  return Number(ym.slice(4, 6)) >= 4 ? y : y - 1;
}

function weekKey(date: string) {
  // 日曜始まりの週
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() - d.getUTCDay());
  return d.toISOString().slice(0, 10);
}

export function checkOfficial(table: OfficialTable, ctx: OfficialContext): OfficialDraft[] {
  switch (table) {
    case "limit":
      return checkLimit(ctx);
    case "exclusive":
      return checkExclusive(ctx);
    case "age":
      return checkAge(ctx);
    case "comment":
      return checkComment(ctx);
    case "facility":
      return checkFacility(ctx);
  }
}

// ---------- 算定回数限度 ----------
function checkLimit({ rec, past, master }: OfficialContext): OfficialDraft[] {
  const out: OfficialDraft[] = [];
  for (const [code, acts] of byCode(rec.acts)) {
    const limits = master.limits.get(code);
    if (!limits) continue;
    const dates = acts.flatMap((a) => a.dates).sort();
    const monthCount = acts.reduce((s, a) => s + a.count, 0);
    const pts = unitPoints(acts.at(-1)!, master);
    const name = nameOf(code, acts, master);
    for (const l of limits) {
      const unitLabel = UNIT_LABELS[l.unitCode] ?? l.unitCode;
      if (l.unit === "day" || l.unit === "week") {
        const counts = new Map<string, number>();
        for (const d of dates) {
          const k = l.unit === "day" ? d : weekKey(d);
          counts.set(k, (counts.get(k) ?? 0) + 1);
        }
        for (const [k, n] of counts) {
          if (n <= l.max) continue;
          out.push({
            date: l.unit === "day" ? k : dates.filter((d) => weekKey(d) === k).at(-1),
            itemCode: code,
            itemName: name,
            points: pts * (n - l.max),
            reason:
              l.unit === "day"
                ? `${md(k)}に${n}回算定されています（${unitLabel}に${l.max}回まで）。`
                : `${md(k)}の週に${n}回算定されています（${unitLabel}に${l.max}回まで）。`,
          });
        }
        continue;
      }
      let total = monthCount;
      const detail: string[] = [];
      if (l.unit !== "month") {
        for (const r of past) {
          const inRange =
            l.unit === "months"
              ? r.month >= monthsBack(rec.month, (l.months ?? 1) - 1) && r.month < rec.month
              : l.unit === "fiscalYear"
                ? fiscalYear(r.month) === fiscalYear(rec.month) && r.month < rec.month
                : r.month < rec.month;
          if (!inRange) continue;
          const n = r.acts.filter((a) => a.code === code).reduce((s, a) => s + a.count, 0);
          if (n) {
            total += n;
            detail.push(`${Number(r.month.slice(4))}月に${n}回`);
          }
        }
      }
      if (total <= l.max) continue;
      const excess = Math.min(total - l.max, monthCount);
      out.push({
        date: dates.at(-1),
        itemCode: code,
        itemName: name,
        points: pts * excess,
        reason:
          `${unitLabel === "1月" ? "同月" : `${unitLabel}の間`}に${total}回算定されています（${unitLabel}に${l.max}回まで）。` +
          (dates.length ? `当月の算定日：${dates.map(md).join("、")}。` : "") +
          (detail.length ? `過去分：${detail.join("、")}。` : ""),
      });
    }
  }
  return out;
}

// ---------- 併算定背反 ----------
function checkExclusive({ rec, master }: OfficialContext): OfficialDraft[] {
  const out: OfficialDraft[] = [];
  const codes = byCode(rec.acts);
  const seen = new Set<string>();
  for (const [code, acts] of codes) {
    for (const e of master.exclusives.get(code) ?? []) {
      if (!codes.has(e.other)) continue;
      const key = [code, e.other].sort().join("|");
      if (seen.has(key)) continue;
      seen.add(key);
      const otherActs = codes.get(e.other)!;
      // どちらか一方（2）のときは点数の低い方を指摘する
      const target =
        e.kahi === "2" && unitPoints(otherActs.at(-1)!, master) < unitPoints(acts.at(-1)!, master)
          ? { code: e.other, acts: otherActs }
          : { code, acts };
      const other = target.code === code ? e.other : code;
      out.push({
        date: target.acts.flatMap((a) => a.dates).sort()[0],
        itemCode: target.code,
        itemName: nameOf(target.code, target.acts, master),
        points: unitPoints(target.acts.at(-1)!, master) * target.acts.reduce((s, a) => s + a.count, 0),
        reason: `「${nameOf(target.code, target.acts, master)}」と「${nameOf(other, codes.get(other)!, master)}」を同月に算定しています（${e.kahi === "2" ? "どちらか一方のみ算定可" : "併算定不可"}）。`,
      });
    }
  }
  return out;
}

// ---------- 年齢制限 ----------
function checkAge({ rec, master }: OfficialContext): OfficialDraft[] {
  if (rec.ageStart === null || rec.ageEnd === null) return [];
  const out: OfficialDraft[] = [];
  for (const [code, acts] of byCode(rec.acts)) {
    const a = master.ages.get(code);
    if (!a) continue;
    // 月内のどの日でも条件を満たさない場合だけ指摘（誕生日をまたぐ月は指摘しない）
    const tooYoung = a.lower !== null && rec.ageEnd < a.lower;
    const tooOld = a.upper !== null && rec.ageStart >= a.upper;
    if (!tooYoung && !tooOld) continue;
    const cond = [a.lower !== null ? `${a.lower}歳以上` : "", a.upper !== null ? `${a.upper}歳未満` : ""].filter(Boolean).join("・");
    out.push({
      date: acts.flatMap((x) => x.dates).sort()[0],
      itemCode: code,
      itemName: nameOf(code, acts, master),
      points: unitPoints(acts.at(-1)!, master) * acts.reduce((s, x) => s + x.count, 0),
      reason: `患者の年齢（当月${rec.ageStart === rec.ageEnd ? `${rec.ageEnd}歳` : `${rec.ageStart}〜${rec.ageEnd}歳`}）が算定できる年齢（${cond}）に当たりません。`,
    });
  }
  return out;
}

// ---------- 必須コメント ----------
function checkComment({ rec, master }: OfficialContext): OfficialDraft[] {
  const out: OfficialDraft[] = [];
  // コメントは直前の診療行為に付くが、記録位置の揺れで誤検知しないようレセプト全体で探す
  const present = new Set(rec.acts.flatMap((a) => a.comments.map((c) => c.code)));
  for (const [code, acts] of byCode(rec.acts)) {
    const groups = master.comments.get(code);
    if (!groups) continue;
    // 紙レセプトの摘要は自由記載（コメントコードが無い）ため、書いてあれば内容までは判定しない
    if (acts.some((a) => a.comments.some((c) => !c.code && c.text))) continue;
    const missing: string[] = [];
    // 診療月の末日時点で有効な記載要件だけを見る
    const day = `${rec.month}31`;
    for (const all of groups.values()) {
      const reqs = all.filter((r) => r.from <= day && day <= r.to);
      if (!reqs.length) continue;
      if (reqs.some((r) => present.has(r.commentCode))) continue;
      missing.push(reqs.map((r) => r.text.replace(/；$/, "")).slice(0, 3).join("／") + (reqs.length > 3 ? " など" : ""));
    }
    if (!missing.length) continue;
    out.push({
      date: acts.flatMap((a) => a.dates).sort()[0],
      itemCode: code,
      itemName: nameOf(code, acts, master),
      points: unitPoints(acts.at(-1)!, master) * acts.reduce((s, a) => s + a.count, 0),
      reason: `記録が必要なコメントがありません：${missing.map((m) => `「${m}」`).join("、")}。`,
    });
  }
  return out;
}

// ---------- 施設基準 ----------
function checkFacility({ rec, master, filedFacility }: OfficialContext): OfficialDraft[] {
  if (filedFacility.size === 0) return [];
  const filed = new Set(filedFacility);
  // レセ電の「届出」欄に記録されている施設基準も届出済みとみなす
  for (const t of rec.todokede) for (const c of TODOKEDE_TO_FACILITY[t] ?? []) filed.add(c);
  const out: OfficialDraft[] = [];
  for (const [code, acts] of byCode(rec.acts)) {
    const need = master.shinryo.get(code)?.facility ?? [];
    if (!need.length || need.some((c) => filed.has(c))) continue;
    out.push({
      date: acts.flatMap((a) => a.dates).sort()[0],
      itemCode: code,
      itemName: nameOf(code, acts, master),
      points: unitPoints(acts.at(-1)!, master) * acts.reduce((s, a) => s + a.count, 0),
      reason: `算定には施設基準「${need.map(facilityNameOf).join("」または「")}」の届出が必要ですが、届出が登録されていません。`,
    });
  }
  return out;
}

