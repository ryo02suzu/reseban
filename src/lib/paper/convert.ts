import "server-only";
import type { MasterIndex } from "../master/bundle";
import { norm } from "../rules/engine";
import { parseTeethInput } from "../teeth";
import { patientKeyOf } from "../uke/parser";
import type { Act, Diagnosis, ParsedReceipt } from "../uke/types";
import { parseDays, type PaperReceipt } from "./types";

/** 紙レセプトの審査支払機関の代わりに使う印（レポートで「紙」と表示） */
export const PAPER_PAYER = "P";

/** 名称・略称からマスターの傷病名を探す（略称の完全一致 → 名称の完全一致 → 名称の部分一致） */
export function findByomei(master: MasterIndex, text: string) {
  const q = norm(text);
  if (!q) return undefined;
  let partial: { code: string; name: string; abbr: string } | undefined;
  for (const [code, e] of master.byomei) {
    if (e.abbr && norm(e.abbr) === q) return { code, ...e };
  }
  for (const [code, e] of master.byomei) {
    const n = norm(e.name);
    if (n === q) return { code, ...e };
    if (!partial && q.length >= 2 && n.includes(q)) partial = { code, ...e };
  }
  return partial;
}

/** 名称から診療行為を探す（コード指定 → 名称・省略名の完全一致） */
export function findShinryo(master: MasterIndex, name: string, code?: string) {
  if (code && master.shinryo.has(code)) return master.shinryo.get(code);
  const q = norm(name);
  if (!q) return undefined;
  for (const e of master.shinryo.values()) {
    if (!e.kasan && (norm(e.name) === q || (e.short && norm(e.short) === q))) return e;
  }
  for (const e of master.shinryo.values()) {
    if (norm(e.name) === q || (e.short && norm(e.short) === q)) return e;
  }
  return undefined;
}

/** 紙レセプトをレセ電と同じ形にして、同じルールエンジンで点検できるようにする */
export function paperToReceipt(p: Pick<PaperReceipt, "no" | keyof import("./types").PaperReceiptInput>, master: MasterIndex, salt: string): ParsedReceipt {
  const ym = `${p.month.slice(0, 4)}-${p.month.slice(4, 6)}`;
  const diagnoses: Diagnosis[] = p.diagnoses.map((d) => {
    const m = findByomei(master, d.name);
    return {
      code: m?.code ?? "0000999",
      baseName: m?.name ?? d.name,
      name: m?.name ?? d.name,
      abbr: m?.abbr || d.name,
      teeth: parseTeethInput(d.teeth).codes,
      modifiers: [],
      uncoded: !m,
    };
  });
  const acts: Act[] = p.acts.map((a) => {
    const m = findShinryo(master, a.name, a.code);
    const days = parseDays(a.days).days;
    const dates = days.map((d) => `${ym}-${String(d).padStart(2, "0")}`);
    return {
      code: m?.code ?? a.code ?? "",
      name: m?.name ?? a.name,
      points: 0,
      count: a.count ?? (dates.length || 1),
      dates,
      teeth: parseTeethInput(a.teeth).codes,
      comments: a.comment ? [{ code: "", text: a.comment, teeth: [] }] : [],
      record: "SS",
    };
  });
  return {
    receiptNo: String(p.no),
    payer: PAPER_PAYER,
    month: p.month,
    receiptType: "",
    inpatient: false,
    karteNo: p.patientId,
    patientKey: patientKeyOf(salt, p.patientId),
    sex: p.sex,
    ageStart: p.age,
    ageEnd: p.age,
    totalPoints: 0,
    todokede: [],
    patientStates: [],
    diagnoses,
    acts,
  };
}
