import { LAYOUT } from "./uke/layout";
import type { MasterEntry } from "./master/parse";
import { monthsBack } from "./rules/engine";

/**
 * 「サンプルデータで試す」用のデータ。
 * コード・点数はすべて架空（実在のマスターとは無関係）。
 */
export const DEMO_MASTER: MasterEntry[] = [
  { code: "900000001", name: "初診料", points: 267 },
  { code: "900000002", name: "再診料", points: 58 },
  { code: "900000003", name: "歯科外来診療医療安全対策加算1（初診）", points: 12 },
  { code: "900000004", name: "歯科外来診療感染対策加算1（初診）", points: 12 },
  { code: "900000010", name: "歯周基本検査（1歯以上10歯未満）", points: 50 },
  { code: "900000011", name: "スケーリング・ルート・プレーニング（臼歯）", points: 72 },
  { code: "900000012", name: "歯科疾患管理料", points: 100 },
  { code: "900000013", name: "機械的歯面清掃処置", points: 72 },
  { code: "900000014", name: "歯科訪問診療1", points: 1100 },
  { code: "900000015", name: "抜髄（大臼歯）", points: 600 },
  { code: "900000016", name: "CAD/CAM冠", points: 1200 },
  { code: "900000017", name: "充填1（単純なもの）", points: 106 },
  { code: "900000018", name: "歯科衛生実地指導料1", points: 80 },
];

const DEMO_DIAG = {
  perio: { code: "8800001", name: "慢性歯周炎" },
  caries: { code: "8800002", name: "う蝕" },
  pulpitis: { code: "8800003", name: "急性化膿性歯髄炎" },
};

/** レセ電の和暦年月（令和） */
function gyymm(ym: string) {
  return `5${String(Number(ym.slice(0, 4)) - 2018).padStart(2, "0")}${ym.slice(4)}`;
}

function line(type: string, len: number, set: Record<number, string | number>) {
  const f: string[] = Array(len).fill("");
  f[0] = type;
  for (const [i, v] of Object.entries(set)) f[Number(i)] = String(v);
  return f.join(",");
}

interface DemoAct {
  code: string;
  days: number[];
  count?: number;
  comment?: string;
}

interface DemoPatient {
  karte: string;
  diag?: { d: keyof typeof DEMO_DIAG; teeth: string[]; acts: DemoAct[] }[];
}

function receiptLines(no: number, ym: string, p: DemoPatient): string[] {
  const out: string[] = [];
  out.push(
    line("RE", 30, {
      [LAYOUT.RE.receiptNo]: no,
      [LAYOUT.RE.receiptType]: "1112",
      [LAYOUT.RE.month]: gyymm(ym),
      [LAYOUT.RE.name]: "デモ　患者",
      [LAYOUT.RE.sex]: 1,
      [LAYOUT.RE.birth]: "3550101",
      [LAYOUT.RE.karteNo]: p.karte,
    }),
  );
  out.push(line("HO", 12, { [LAYOUT.HO.insurerNo]: "06130000", [LAYOUT.HO.kigo]: "デモ", [LAYOUT.HO.bango]: p.karte, [LAYOUT.HO.days]: 1 }));
  for (const g of p.diag ?? []) {
    const d = DEMO_DIAG[g.d];
    out.push(
      line("HS", 12, {
        [LAYOUT.HS.startDate]: `${gyymm(ym)}01`,
        [LAYOUT.HS.outcome]: 1,
        [LAYOUT.HS.code]: d.code,
        [LAYOUT.HS.name]: d.name,
        [LAYOUT.HS.teeth]: g.teeth.join("/"),
      }),
    );
    for (const a of g.acts) {
      const m = DEMO_MASTER.find((e) => e.code === a.code)!;
      const f: string[] = Array(10).fill("");
      f[0] = "SS";
      f[LAYOUT.SS.shinryoShikibetsu] = "11";
      f[LAYOUT.SS.code] = a.code;
      f[LAYOUT.SS.points] = String(m.points ?? 0);
      f[LAYOUT.SS.count] = String(a.count ?? a.days.length);
      const days = Array(31).fill("");
      for (const d of a.days) days[d - 1] = "1";
      out.push([...f, ...days].join(","));
      if (a.comment) out.push(line("CO", 5, { [LAYOUT.CO.code]: "830000001", [LAYOUT.CO.text]: a.comment }));
    }
  }
  return out;
}

const C = (name: string) => DEMO_MASTER.find((e) => e.name.startsWith(name))!.code;

function patientsFor(ym: string, target: string): DemoPatient[] {
  const isTarget = ym === target;
  const prev = monthsBack(target, 1);
  const list: DemoPatient[] = [];
  // 問題のない患者を並べて件数を出す
  for (let i = 0; i < 24; i++) {
    list.push({
      karte: `1${String(i).padStart(4, "0")}`,
      diag: [
        { d: "caries", teeth: ["16"], acts: [{ code: C("再診料"), days: [3 + (i % 20)] }, { code: C("充填1"), days: [3 + (i % 20)] }] },
      ],
    });
  }
  if (isTarget) {
    list.push(
      // SRP：歯周病検査なし＋47に歯周炎の病名なし
      {
        karte: "00123",
        diag: [
          { d: "perio", teeth: ["46"], acts: [{ code: C("再診料"), days: [4] }] },
          { d: "caries", teeth: ["46", "47"], acts: [{ code: C("スケーリング"), days: [4] }] },
        ],
      },
      // 歯科疾患管理料 月2回
      { karte: "00456", diag: [{ d: "perio", teeth: [], acts: [{ code: C("再診料"), days: [2, 16] }, { code: C("歯科疾患管理料"), days: [2, 16] }] }] },
      // 訪問診療 コメントなし
      { karte: "00789", diag: [{ d: "perio", teeth: [], acts: [{ code: C("歯科訪問診療1"), days: [11] }] }] },
      // 初診料に加算なし（届出あり）
      { karte: "00321", diag: [{ d: "caries", teeth: ["26"], acts: [{ code: C("初診料"), days: [9] }, { code: C("充填1"), days: [9] }] }] },
      // 同日の初診料・再診料
      { karte: "00555", diag: [{ d: "caries", teeth: ["15"], acts: [{ code: C("初診料"), days: [10] }, { code: C("再診料"), days: [10] }, { code: C("歯科外来診療医療安全対策加算1"), days: [10] }, { code: C("歯科外来診療感染対策加算1"), days: [10] }] }] },
      // 機械的歯面清掃 先月も算定
      { karte: "00666", diag: [{ d: "perio", teeth: [], acts: [{ code: C("再診料"), days: [5] }, { code: C("機械的歯面清掃処置"), days: [5] }] }] },
      // 抜髄 歯髄炎の病名なし
      { karte: "00777", diag: [{ d: "caries", teeth: ["36"], acts: [{ code: C("再診料"), days: [12] }, { code: C("抜髄"), days: [12] }] }] },
      // CAD/CAM冠 届出なし
      { karte: "00888", diag: [{ d: "caries", teeth: ["45"], acts: [{ code: C("再診料"), days: [18] }, { code: C("CAD/CAM冠"), days: [18] }] }] },
      // 問題なし：検査→SRP、訪問診療コメントあり
      {
        karte: "00999",
        diag: [
          { d: "perio", teeth: ["16", "17"], acts: [{ code: C("再診料"), days: [1, 8] }, { code: C("歯周基本検査"), days: [1] }, { code: C("スケーリング"), days: [8] }] },
        ],
      },
      { karte: "01000", diag: [{ d: "perio", teeth: [], acts: [{ code: C("歯科訪問診療1"), days: [20], comment: "実施時刻 14時00分～14時30分" }] }] },
    );
  }
  if (ym === prev) {
    list.push({ karte: "00666", diag: [{ d: "perio", teeth: [], acts: [{ code: C("再診料"), days: [7] }, { code: C("機械的歯面清掃処置"), days: [7] }] }] });
  }
  return list;
}

export function demoUke(ym: string, target: string): string {
  const lines = [line("IR", 10, { 1: 1, 2: 13, 3: 3, 4: "1234567", 6: "サンプル歯科医院", 7: gyymm(ym) })];
  patientsFor(ym, target).forEach((p, i) => lines.push(...receiptLines(i + 1, ym, p)));
  lines.push(line("GO", 4, { 1: 0, 2: 0 }));
  return lines.join("\r\n") + "\r\n";
}

export const DEMO_FILED = ["歯科外来診療医療安全対策加算1", "歯科外来診療感染対策加算1"];
