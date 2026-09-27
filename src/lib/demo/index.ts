import { LAYOUT } from "../uke/layout";
import { monthsBack } from "../rules/engine";
import type { MasterData } from "../master/types";
import DEMO_MASTER_JSON from "./master.json";

/**
 * 「サンプルデータで試す」用のレセ電（記録条件仕様 令和8年6月版の形式）。
 * コードは実在の歯科診療行為マスター・傷病名マスターのもの。患者はすべて架空。
 */
export const DEMO_MASTER = DEMO_MASTER_JSON as MasterData;

/** サンプル医院が届け出ている施設基準（歯初診・外安全1・外感染1・歯科訪問診療料の注16の基準） */
export const DEMO_FILED = ["1351", "1352", "1370", "1347"];

const C = {
  shoshin: "301000110",
  saishin: "301001610",
  nyuyoji: "CA001", // 乳幼児加算（初診）の加算コード
  pKiken: "304000410",
  srpMolar: "309005210",
  shikan: "302000110",
  tokushitsu: "302000710",
  shisei: "309011410",
  houmon1: "303000110",
  bassui3: "309002310",
  cadcam: "313025510",
  jutenSimple: "313024310",
};

const D = {
  caries: "8843836", // う蝕（Ｃ）
  perio: "5234016", // 慢性歯周炎（Ｐ）
  pulpitis: "5220064", // 急性化膿性歯髄炎（Ｐｕｌ）
};

/** 歯式コード：歯種4桁 + 状態「0」(現存歯) + 部分「0」(指定なし) */
const T = (tooth: string) => `10${tooth}00`;

function rec(type: string, len: number, set: Record<number, string | number>) {
  const f: string[] = Array(len).fill("");
  f[0] = type;
  for (const [i, v] of Object.entries(set)) f[Number(i)] = String(v);
  return f.join(",");
}

interface DemoAct {
  code: string;
  days: number[];
  kasan?: string[];
  comments?: { code: string; text?: string }[];
}

interface DemoPatient {
  karte: string;
  birth?: string;
  diag: { code: string; teeth: string[] }[];
  acts: DemoAct[];
}

function receiptLines(no: number, ym: string, p: DemoPatient): string[] {
  const out: string[] = [];
  out.push(rec("IR", 9, { 1: 1, 2: 13, 3: 3, 4: "1234567", 6: ym, 8: "17" }));
  out.push(
    rec("RE", 27, {
      [LAYOUT.RE.receiptNo]: no,
      [LAYOUT.RE.receiptType]: "3112",
      [LAYOUT.RE.month]: ym,
      4: "デモ　患者", // 氏名（パーサーは読まない）
      [LAYOUT.RE.sex]: 1,
      [LAYOUT.RE.birth]: p.birth ?? "19800101",
      [LAYOUT.RE.karteNo]: p.karte,
      25: "デモカンジャ", // カナ氏名（パーサーは読まない）
    }),
  );
  out.push(rec("HO", 12, { [LAYOUT.HO.insurerNo]: "06130000", [LAYOUT.HO.kigo]: "デモ", [LAYOUT.HO.bango]: p.karte, [LAYOUT.HO.days]: 1 }));
  for (const d of p.diag) {
    out.push(rec("HS", 13, { [LAYOUT.HS.teeth]: d.teeth.map(T).join(""), [LAYOUT.HS.code]: d.code }));
  }
  for (const a of p.acts) {
    const f: string[] = Array(LAYOUT.SS.dayStart + 31).fill("");
    f[0] = "SS";
    f[1] = "80";
    f[2] = "1";
    f[LAYOUT.SS.code] = a.code;
    (a.kasan ?? []).forEach((k, i) => (f[LAYOUT.SS.kasanStart + i * 2] = k));
    f[LAYOUT.SS.count] = String(a.days.length);
    for (const d of a.days) f[LAYOUT.SS.dayStart + d - 1] = String(Number(f[LAYOUT.SS.dayStart + d - 1] || 0) + 1);
    out.push(f.join(","));
    for (const c of a.comments ?? []) out.push(rec("CO", 11, { 2: "1", [LAYOUT.CO.code]: c.code, [LAYOUT.CO.text]: c.text ?? "" }));
  }
  return out;
}

function patientsFor(ym: string, target: string): DemoPatient[] {
  const list: DemoPatient[] = [];
  // 問題のない患者を並べて件数を出す
  for (let i = 0; i < 24; i++) {
    const day = 3 + (i % 20);
    list.push({
      karte: `1${String(i).padStart(4, "0")}`,
      diag: [{ code: D.caries, teeth: ["16"] }],
      acts: [
        { code: C.saishin, days: [day] },
        { code: C.jutenSimple, days: [day] },
      ],
    });
  }
  if (ym === target) {
    list.push(
      // SRP 2歯：歯周病検査なし、歯周炎の病名は1歯だけ
      {
        karte: "00123",
        diag: [
          { code: D.perio, teeth: ["46"] },
          { code: D.caries, teeth: ["47"] },
        ],
        acts: [
          { code: C.saishin, days: [4] },
          { code: C.srpMolar, days: [4, 4] },
        ],
      },
      // 歯科疾患管理料 月2回
      { karte: "00456", diag: [{ code: D.perio, teeth: [] }], acts: [{ code: C.saishin, days: [2, 16] }, { code: C.shikan, days: [2, 16] }] },
      // 歯科訪問診療1 コメントなし
      { karte: "00789", diag: [{ code: D.perio, teeth: [] }], acts: [{ code: C.houmon1, days: [11] }] },
      // 初診料に外安全・外感染の加算なし（届出あり）
      { karte: "00321", diag: [{ code: D.caries, teeth: ["26"] }], acts: [{ code: C.shoshin, days: [9] }, { code: C.jutenSimple, days: [9] }] },
      // 同日の初診料と再診料
      { karte: "00555", diag: [{ code: D.caries, teeth: ["15"] }], acts: [{ code: C.shoshin, days: [10] }, { code: C.saishin, days: [10] }] },
      // 機械的歯面清掃処置 月2回
      { karte: "00666", diag: [{ code: D.perio, teeth: [] }], acts: [{ code: C.saishin, days: [5, 19] }, { code: C.shisei, days: [5, 19] }] },
      // 抜髄：歯髄炎の病名なし
      { karte: "00777", diag: [{ code: D.caries, teeth: ["36"] }], acts: [{ code: C.saishin, days: [12] }, { code: C.bassui3, days: [12] }] },
      // CAD/CAM冠：施設基準の届出なし
      { karte: "00888", diag: [{ code: D.caries, teeth: ["45"] }], acts: [{ code: C.saishin, days: [18] }, { code: C.cadcam, days: [18] }] },
      // 歯科疾患管理料と歯科特定疾患療養管理料を同月
      { karte: "01100", diag: [{ code: D.perio, teeth: [] }], acts: [{ code: C.saishin, days: [6, 20] }, { code: C.shikan, days: [6] }, { code: C.tokushitsu, days: [20] }] },
      // 乳幼児加算（初診）を10歳の患者に
      {
        karte: "01200",
        birth: "20160101",
        diag: [{ code: D.caries, teeth: ["55"] }],
        acts: [{ code: C.shoshin, days: [13], kasan: [C.nyuyoji] }],
      },
      // 問題なし：検査→SRP（病名2歯）
      {
        karte: "00999",
        diag: [{ code: D.perio, teeth: ["16", "17"] }],
        acts: [
          { code: C.saishin, days: [1, 8] },
          { code: C.pKiken, days: [1] },
          { code: C.srpMolar, days: [8, 8] },
        ],
      },
      // 問題なし：訪問診療にコメント4つ
      {
        karte: "01000",
        diag: [{ code: D.perio, teeth: [] }],
        acts: [
          {
            code: C.houmon1,
            days: [20],
            comments: [
              { code: "853100010", text: "20日1400" },
              { code: "853100011", text: "20日1430" },
              { code: "830100348", text: "特別養護老人ホームさくら" },
              { code: "830100349", text: "通院困難（要介護３）" },
            ],
          },
        ],
      },
      // 問題なし：抜髄と歯髄炎（同じ歯）
      { karte: "01300", diag: [{ code: D.pulpitis, teeth: ["36"] }], acts: [{ code: C.saishin, days: [14] }, { code: C.bassui3, days: [14] }] },
    );
  }
  return list;
}

export function demoUke(ym: string, target: string): string {
  const lines = [rec("UK", 10, { 1: 1, 2: 13, 3: 3, 4: "1234567", 6: "サンプル歯科医院", 7: ym, 8: "17", 9: "00" })];
  patientsFor(ym, target).forEach((p, i) => lines.push(...receiptLines(i + 1, ym, p)));
  lines.push(rec("GO", 4, { 1: 0, 2: 0, 3: "99" }));
  return lines.join("\r\n") + "\r\n\x1a";
}

export const DEMO_TARGET = "202609";
export const demoHistoryMonths = () => Array.from({ length: 6 }, (_, i) => monthsBack(DEMO_TARGET, 6 - i));
