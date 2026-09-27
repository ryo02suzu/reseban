import { createHash } from "node:crypto";
import { DROP_RECORDS, LAYOUT } from "./layout";
import type { Act, Diagnosis, ParsedFile, ParsedReceipt } from "./types";
import { splitCsv, toSeireki } from "./text";
import { splitToothCodes } from "../teeth";
import type { MasterIndex } from "../master/bundle";

export { decodeUke, splitCsv, toSeireki } from "./text";

function num(v: string | undefined): number {
  const n = Number((v ?? "").trim());
  return Number.isFinite(n) ? n : 0;
}

function chunks(s: string | undefined, size: number): string[] {
  const v = (s ?? "").trim();
  const out: string[] = [];
  for (let i = 0; i + size <= v.length; i += size) out.push(v.slice(i, i + size));
  return out;
}

/** 満年齢（誕生日の前日に1つ増える民法の扱いは、月単位の点検では影響しないので通常の計算） */
function ageAt(birth: string, ymd: string): number | null {
  if (!/^\d{8}$/.test(birth) || !/^\d{8}$/.test(ymd)) return null;
  let age = Number(ymd.slice(0, 4)) - Number(birth.slice(0, 4));
  if (ymd.slice(4) < birth.slice(4)) age--;
  return age >= 0 ? age : null;
}

function lastDay(ym: string): string {
  const y = Number(ym.slice(0, 4));
  const m = Number(ym.slice(4, 6));
  const d = new Date(Date.UTC(y, m, 0)).getUTCDate();
  return `${ym}${String(d).padStart(2, "0")}`;
}

function prevMonth(ym: string): string {
  const y = Number(ym.slice(0, 4));
  const m = Number(ym.slice(4, 6)) - 1;
  return m === 0 ? `${y - 1}12` : `${y}${String(m).padStart(2, "0")}`;
}

export interface ParseOptions {
  /** マスター索引（名称・加算コード・傷病名の引き当て） */
  master?: MasterIndex;
  /** 患者キー用の秘密値（医院ごとに固定） */
  salt: string;
}

function readDays(f: string[], start: number, month: string): string[] {
  const dates: string[] = [];
  if (!/^\d{6}$/.test(month)) return dates;
  for (let d = 0; d < 31; d++) {
    const n = num(f[start + d]);
    for (let k = 0; k < n; k++) dates.push(`${month.slice(0, 4)}-${month.slice(4, 6)}-${String(d + 1).padStart(2, "0")}`);
  }
  return dates;
}

export function parseUke(text: string, opts: ParseOptions): ParsedFile {
  const M = opts.master;
  const lines = text.replace(/\x1a/g, "").split(/\r?\n/);
  const file: ParsedFile = {
    payer: "",
    volume: "",
    clinicCode: "",
    clinicName: "",
    billingMonth: "",
    month: "",
    todokede: [],
    receipts: [],
    warnings: [],
    unknownCodes: [],
  };
  const unknown = new Set<string>();

  let cur: ParsedReceipt | null = null;
  let irTodokede: string[] = [];
  let irPayer = "";
  /** RE の生年月日・カルテ番号（患者キーを作ったら捨てる） */
  let birth = "";
  let insurer: string[] = [];
  let lastAct: Act | null = null;
  let coexistLeft = 0;
  let coexistTeeth: string[] = [];

  const finish = () => {
    if (cur) {
      const c: ParsedReceipt = cur;
      c.patientKey = c.karteNo
        ? hashKey(opts.salt, ["k", c.karteNo, birth])
        : hashKey(opts.salt, ["i", ...insurer, birth]);
      file.receipts.push(c);
    }
    cur = null;
    birth = "";
    insurer = [];
    lastAct = null;
    coexistLeft = 0;
    coexistTeeth = [];
  };

  const actName = (code: string) => {
    const e = M?.shinryo.get(code);
    if (!e && M?.shinryo.size && /^3/.test(code)) unknown.add(code);
    return e?.name ?? "";
  };

  for (const raw of lines) {
    if (!raw.trim()) continue;
    const f = splitCsv(raw);
    const type = f[0]?.trim();
    if (DROP_RECORDS.has(type)) continue;

    switch (type) {
      case "UK": {
        const L = LAYOUT.UK;
        if (f[L.tensuHyo]?.trim() !== "3") file.warnings.push("歯科のレセ電ではありません（受付情報の点数表が「3：歯科」ではありません）");
        file.payer = f[L.payer]?.trim() ?? "";
        file.volume = f[L.volume]?.trim() ?? "";
        file.clinicCode = f[L.clinicCode]?.trim() ?? "";
        file.clinicName = f[L.clinicName]?.trim() ?? "";
        file.billingMonth = toSeireki(f[L.billingMonth]);
        file.todokede = chunks(f[L.todokede], 2);
        break;
      }
      case "IR": {
        finish();
        const L = LAYOUT.IR;
        if (f[L.tensuHyo]?.trim() && f[L.tensuHyo].trim() !== "3") file.warnings.push("歯科以外のレセプトが含まれています");
        file.clinicCode ||= f[L.clinicCode]?.trim() ?? "";
        file.billingMonth ||= toSeireki(f[L.billingMonth]);
        irTodokede = chunks(f[L.todokede], 2);
        irPayer = f[L.payer]?.trim() ?? "";
        file.payer ||= irPayer;
        break;
      }
      case "RE": {
        finish();
        const L = LAYOUT.RE;
        const month = toSeireki(f[L.month]);
        const receiptType = f[L.receiptType]?.trim() ?? "";
        birth = toSeireki(f[L.birth]);
        cur = {
          receiptNo: f[L.receiptNo]?.trim() ?? "",
          payer: irPayer || file.payer,
          month,
          receiptType,
          inpatient: /^\d{3}[13579]$/.test(receiptType),
          karteNo: f[L.karteNo]?.trim() ?? "",
          patientKey: "",
          sex: f[L.sex]?.trim() ?? "",
          ageStart: ageAt(birth, lastDay(prevMonth(month))),
          ageEnd: ageAt(birth, lastDay(month)),
          totalPoints: 0,
          todokede: irTodokede.length ? irTodokede : file.todokede,
          patientStates: chunks(f[L.patientStates], 3),
          diagnoses: [],
          acts: [],
        };
        // 氏名(4)・カナ氏名(25)・請求情報２(21) は読まない
        break;
      }
      case "HO": {
        if (!cur) break;
        const L = LAYOUT.HO;
        insurer = [f[L.insurerNo], f[L.kigo], f[L.bango]].map((v) => (v ?? "").trim());
        (cur as ParsedReceipt).totalPoints = num(f[L.totalPoints]);
        break;
      }
      case "HS": {
        if (!cur) break;
        const L = LAYOUT.HS;
        let teeth = splitToothCodes(f[L.teeth]);
        if (coexistLeft > 0 && teeth.length === 0) {
          teeth = coexistTeeth;
          coexistLeft--;
        } else {
          const n = num(f[L.coexist]);
          coexistLeft = n > 1 ? n - 1 : 0;
          coexistTeeth = teeth;
        }
        const code = f[L.code]?.trim() ?? "";
        const uncoded = code === "0000999";
        const master = M?.byomei.get(code);
        const baseName = uncoded ? (f[L.name]?.trim() ?? "") : (master?.name ?? "");
        const modifiers = chunks(f[L.modifiers], 4);
        const pre = modifiers.filter((m) => m < "8000").map((m) => M?.shushokugo.get(m) ?? "");
        const post = modifiers.filter((m) => m >= "8000").map((m) => M?.shushokugo.get(m) ?? "");
        const d: Diagnosis = {
          code,
          baseName,
          name: `${pre.join("")}${baseName || `傷病名コード${code}`}${post.join("")}`,
          abbr: master?.abbr ?? "",
          teeth,
          modifiers,
          uncoded,
        };
        if (!uncoded && M?.byomei.size && !master) unknown.add(code);
        (cur as ParsedReceipt).diagnoses.push(d);
        break;
      }
      case "SS": {
        if (!cur) break;
        const c: ParsedReceipt = cur;
        const L = LAYOUT.SS;
        const code = f[L.code]?.trim() ?? "";
        const dates = readDays(f, L.dayStart, c.month);
        const count = num(f[L.count]) || dates.length || 1;
        const act: Act = {
          code,
          name: actName(code),
          points: num(f[L.points]),
          count,
          dates,
          teeth: [],
          comments: [],
          record: "SS",
        };
        c.acts.push(act);
        // 加算コード1〜35は、それぞれ独立した診療行為として扱う
        for (let i = 0; i < L.kasanPairs; i++) {
          const k = f[L.kasanStart + i * 2]?.trim();
          if (!k) continue;
          const e = M?.byKasan.get(k);
          if (!e && M?.shinryo.size) unknown.add(`加算${k}`);
          c.acts.push({
            code: e?.code ?? `kasan:${k}`,
            name: e?.name ?? "",
            points: 0,
            count,
            dates,
            teeth: [],
            comments: [],
            record: "SS",
            parentCode: code,
          });
        }
        lastAct = act;
        break;
      }
      case "SI":
      case "IY":
      case "TO": {
        if (!cur) break;
        const c: ParsedReceipt = cur;
        const L = LAYOUT[type];
        const dates = readDays(f, L.dayStart, c.month);
        const act: Act = {
          code: f[L.code]?.trim() ?? "",
          name: "",
          points: num(f[L.points]),
          count: num(f[L.count]) || dates.length || 1,
          dates,
          teeth: [],
          comments: [],
          record: type,
        };
        c.acts.push(act);
        lastAct = act;
        break;
      }
      case "CO": {
        if (!cur) break;
        const L = LAYOUT.CO;
        const teeth = splitToothCodes(f[L.teeth]);
        const comment = { code: f[L.code]?.trim() ?? "", text: f[L.text]?.trim() ?? "", teeth };
        if (lastAct) {
          const a: Act = lastAct;
          a.comments.push(comment);
          for (const t of teeth) if (!a.teeth.includes(t)) a.teeth.push(t);
        }
        break;
      }
      case "GO":
        finish();
        break;
      default:
        break;
    }
  }
  finish();

  const counts = new Map<string, number>();
  for (const r of file.receipts) counts.set(r.month, (counts.get(r.month) ?? 0) + 1);
  file.month = [...counts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? "";
  if (file.receipts.length === 0) file.warnings.push("レセプト（REレコード）が見つかりませんでした");
  if (counts.size > 1) {
    const others = [...counts].filter(([m]) => m !== file.month);
    file.warnings.push(
      `月遅れ請求など、${others.map(([m, n]) => `${m.slice(0, 4)}年${Number(m.slice(4))}月診療分${n}件`).join("・")}が含まれています（診療月ごとに判定しています）`,
    );
  }
  file.unknownCodes = [...unknown].slice(0, 50);
  if (unknown.size) {
    file.warnings.push(`マスターに無いコードが${unknown.size}件あります（例：${[...unknown].slice(0, 3).join("、")}）。マスターが古い可能性があります。`);
  }
  return file;
}

/** 紙レセプトなど、レセ電以外から作るレセプトの患者キー（レセ電と同じ作り方） */
export function patientKeyOf(salt: string, karteNo: string, birth = ""): string {
  return hashKey(salt, ["k", karteNo, birth]);
}

function hashKey(salt: string, parts: (string | undefined)[]): string {
  return createHash("sha256")
    .update(salt)
    .update(parts.map((p) => p ?? "").join("|"))
    .digest("hex")
    .slice(0, 20);
}
