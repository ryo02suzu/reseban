import { createHash } from "node:crypto";
import { DROP_RECORDS, LAYOUT } from "./layout";
import type { Act, Diagnosis, ParsedFile, ParsedReceipt } from "./types";
import { splitCsv, toSeireki } from "./text";

export { decodeUke, splitCsv, toSeireki } from "./text";

function num(v: string | undefined): number {
  const n = Number((v ?? "").trim());
  return Number.isFinite(n) ? n : 0;
}

function splitTeeth(v: string | undefined): string[] {
  return (v ?? "")
    .split(/[\/\s]+/)
    .map((t) => t.trim())
    .filter(Boolean);
}

export interface ParseOptions {
  /** 診療行為コード → 名称 */
  lookupName?: (code: string) => string | undefined;
  /** 患者キー用の秘密値（院ごとに固定） */
  salt: string;
}

export function parseUke(text: string, opts: ParseOptions): ParsedFile {
  const lines = text.replace(/\x1a/g, "").split(/\r?\n/);
  const file: ParsedFile = {
    clinicCode: "",
    clinicName: "",
    billingMonth: "",
    month: "",
    receipts: [],
    warnings: [],
  };

  let cur: ParsedReceipt | null = null;
  /** RE で読んだ生年月日（HO と合わせて患者キーを作ったら捨てる） */
  let pendingBirth = "";
  let currentTeeth: string[] = [];
  let lastAct: Act | null = null;

  const finish = () => {
    if (cur) {
      if (!cur.patientKey) cur.patientKey = hashKey(opts.salt, ["karte", cur.karteNo, pendingBirth]);
      file.receipts.push(cur);
    }
    cur = null;
    pendingBirth = "";
    currentTeeth = [];
    lastAct = null;
  };

  for (const raw of lines) {
    if (!raw.trim()) continue;
    const f = splitCsv(raw);
    const type = f[0]?.trim();

    if (DROP_RECORDS.has(type)) continue;

    switch (type) {
      case "IR": {
        const L = LAYOUT.IR;
        if (f[L.tensuHyo] && f[L.tensuHyo].trim() !== "3") {
          file.warnings.push("歯科以外の点数表のファイルです（IRの点数表が3ではありません）");
        }
        file.clinicCode = f[L.clinicCode]?.trim() ?? "";
        file.clinicName = f[L.clinicName]?.trim() ?? "";
        file.billingMonth = toSeireki(f[L.billingMonth]);
        break;
      }
      case "RE": {
        finish();
        const L = LAYOUT.RE;
        cur = {
          receiptNo: f[L.receiptNo]?.trim() ?? "",
          month: toSeireki(f[L.month]),
          karteNo: f[L.karteNo]?.trim() ?? "",
          patientKey: "",
          sex: f[L.sex]?.trim() ?? "",
          totalPoints: 0,
          diagnoses: [],
          acts: [],
        };
        pendingBirth = f[L.birth]?.trim() ?? "";
        // 氏名 f[L.name] は読まない
        break;
      }
      case "HO": {
        if (!cur) break;
        const L = LAYOUT.HO;
        const c: ParsedReceipt = cur;
        c.patientKey = hashKey(opts.salt, [
          f[L.insurerNo]?.trim(),
          f[L.kigo]?.trim(),
          f[L.bango]?.trim(),
          pendingBirth,
        ]);
        c.totalPoints = num(f[L.totalPoints]);
        break;
      }
      case "HS": {
        if (!cur) break;
        const L = LAYOUT.HS;
        const d: Diagnosis = {
          code: f[L.code]?.trim() ?? "",
          name: f[L.name]?.trim() ?? "",
          teeth: splitTeeth(f[L.teeth]),
          startDate: toSeireki(f[L.startDate]) || undefined,
          outcome: f[L.outcome]?.trim() || undefined,
        };
        (cur as ParsedReceipt).diagnoses.push(d);
        // 後続の診療行為はこの部位に対するものとして扱う
        currentTeeth = d.teeth;
        break;
      }
      case "SS":
      case "IY":
      case "TO": {
        if (!cur) break;
        const c: ParsedReceipt = cur;
        const L = LAYOUT[type];
        const code = f[L.code]?.trim() ?? "";
        const days = f.slice(-L.dayColumns);
        const dates: string[] = [];
        if (f.length > L.dayColumns + L.count) {
          days.forEach((v, i) => {
            if (num(v) > 0) dates.push(`${c.month.slice(0, 4)}-${c.month.slice(4, 6)}-${String(i + 1).padStart(2, "0")}`);
          });
        }
        const act: Act = {
          code,
          name: opts.lookupName?.(code) ?? "",
          points: num(f[L.points]),
          count: num(f[L.count]) || dates.length || 1,
          dates,
          teeth: [...currentTeeth],
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
        const comment = { code: f[L.code]?.trim() ?? "", text: f[L.text]?.trim() ?? "" };
        if (lastAct) (lastAct as Act).comments.push(comment);
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
  return file;
}

function hashKey(salt: string, parts: (string | undefined)[]): string {
  return createHash("sha256")
    .update(salt)
    .update(parts.map((p) => p ?? "").join("|"))
    .digest("hex")
    .slice(0, 16);
}
