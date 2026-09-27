import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { parseUke, toSeireki, decodeUke } from "@/lib/uke/parser";
import { runRules, summarize } from "@/lib/rules/engine";
import { BUILTIN_RULES } from "@/lib/rules/builtin";
import { DEMO_FILED, DEMO_MASTER, demoUke } from "@/lib/demo";
import { buildIndex } from "@/lib/master/bundle";
import { buildRanking, parseClaimHistory, reprioritize } from "@/lib/rules/ranking";
import { parseMasterFile, guessKind } from "@/lib/master/parse";
import { teethLabel } from "@/lib/teeth";
import type { Finding } from "@/lib/types";

const master = buildIndex(DEMO_MASTER);
const opts = { salt: "t", master };
const fixture = (f: string) => new Uint8Array(readFileSync(path.join(__dirname, "fixtures/ssk", f)));

function audit(filed = DEMO_FILED) {
  const cur = parseUke(demoUke("202609", "202609"), opts);
  const history = ["202603", "202604", "202605", "202606", "202607", "202608"].flatMap((m) => parseUke(demoUke(m, "202609"), opts).receipts);
  return { cur, findings: runRules({ current: cur.receipts, history, rules: BUILTIN_RULES, filedFacility: filed, master }) };
}

const rulesOf = (fs: Finding[], k: string) =>
  fs
    .filter((f) => f.karteNo === k)
    .map((f) => f.ruleId)
    .sort();

describe("公式マスター（Shift_JIS・令和8年版の抜粋）", () => {
  it("歯科診療行為マスター：コード・名称・点数・施設基準", () => {
    const rows = parseMasterFile("shinryo", fixture("h_ALL_excerpt.csv"));
    const shoshin = rows.find((r) => r.code === "301000110")!;
    expect(shoshin.name).toBe("歯科初診料");
    expect(shoshin.points).toBe(272);
    expect(shoshin.facility).toEqual(["1351"]);
    expect(rows.find((r) => r.code === "301000370")!.kasan).toBe("CA001");
  });

  it("算定回数限度・年齢制限・併算定背反", () => {
    const limit = parseMasterFile("limit", fixture("h-6_excerpt.csv"));
    expect(limit.find((l) => l.code === "302000110")).toMatchObject({ unit: "month", max: 1 });
    const age = parseMasterFile("age", fixture("h-8_excerpt.csv"));
    expect(age[0]).toMatchObject({ code: "301000370", upper: 6 });
    const ex = parseMasterFile("exclusive", fixture("h-9_ALL.csv"));
    expect(ex).toContainEqual({ code: "302000110", other: "302000710", kahi: "0" });
  });

  it("コメント関連テーブル：歯科・条件区分01だけ", () => {
    const ck = parseMasterFile("commentRel", fixture("ck_excerpt.csv"));
    expect(ck.map((c) => c.commentCode).sort()).toEqual(["830100348", "830100349", "853100010", "853100011"]);
    expect(new Set(ck.map((c) => c.group)).size).toBe(4);
  });

  it("傷病名・歯式・修飾語・コメント", () => {
    const b = parseMasterFile("byomei", fixture("b_excerpt.txt"));
    expect(b.find((x) => x.code === "5234016")).toMatchObject({ name: "慢性歯周炎", abbr: "Ｐ" });
    const f = parseMasterFile("shishiki", fixture("f_ALL.csv"));
    expect(f.length).toBeGreaterThan(900);
    expect(parseMasterFile("shushokugo", fixture("z_excerpt.txt")).length).toBe(50);
    expect(parseMasterFile("comment", fixture("c_excerpt.csv")).map((c) => c.code)).toContain("853100010");
  });

  it("ファイル名から種類を推定", () => {
    expect(guessKind("h_ALL20260807.csv")).toBe("shinryo");
    expect(guessKind("h-6_ALL20260724.csv")).toBe("limit");
    expect(guessKind("ck_ALL_20260911.zip")).toBe("commentRel");
    expect(guessKind("b_20260601.zip")).toBe("byomei");
  });

  it("種類を間違えたファイルは弾く", () => {
    expect(() => parseMasterFile("byomei", fixture("h_ALL_excerpt.csv"))).toThrow("傷病名マスター");
  });
});

describe("レセ電パーサー（記録条件仕様 令和8年6月版）", () => {
  const f = parseUke(demoUke("202609", "202609"), opts);

  it("受付情報・届出・診療年月", () => {
    expect(f.clinicCode).toBe("1234567");
    expect(f.clinicName).toBe("サンプル歯科医院");
    expect(f.month).toBe("202609");
    expect(f.todokede).toEqual(["17"]);
  });

  it("氏名・カナ氏名・保険証番号・生年月日を保持しない", () => {
    const json = JSON.stringify(f);
    expect(json).not.toContain("デモ　患者");
    expect(json).not.toContain("デモカンジャ");
    expect(json).not.toContain("06130000");
    expect(json).not.toContain("19800101");
  });

  it("年齢だけを持つ", () => {
    const r = f.receipts.find((x) => x.karteNo === "01200")!;
    expect([r.ageStart, r.ageEnd]).toEqual([10, 10]);
  });

  it("同じ患者は月をまたいで同じキー", () => {
    const b = parseUke(demoUke("202608", "202609"), opts).receipts.find((r) => r.karteNo === "10000")!;
    expect(f.receipts.find((r) => r.karteNo === "10000")!.patientKey).toBe(b.patientKey);
  });

  it("傷病名はマスターから名称と歯科略称を引く", () => {
    const d = f.receipts.find((x) => x.karteNo === "00123")!.diagnoses[0];
    expect(d).toMatchObject({ code: "5234016", name: "慢性歯周炎", abbr: "Ｐ", teeth: ["104600"] });
    expect(teethLabel(d.teeth)).toBe("右下6");
  });

  it("算定日・回数・加算コード・コメント", () => {
    const acts = f.receipts.find((x) => x.karteNo === "01200")!.acts;
    expect(acts.map((a) => a.name)).toEqual(["歯科初診料", "乳幼児加算（初診）"]);
    expect(acts[1].parentCode).toBe("301000110");
    const houmon = f.receipts.find((x) => x.karteNo === "01000")!.acts[0];
    expect(houmon.dates).toEqual(["2026-09-20"]);
    expect(houmon.comments.map((c) => c.code)).toContain("853100010");
    const srp = f.receipts.find((x) => x.karteNo === "00123")!.acts[1];
    expect(srp).toMatchObject({ count: 2, dates: ["2026-09-04", "2026-09-04"] });
  });

  it("併存傷病名は歯式を共有する", () => {
    const text = [
      "UK,1,13,3,1234567,,テスト,202609,,00",
      "IR,1,13,3,1234567,,202609,,",
      "RE,1,3112,202609,テスト　タロウ,1,19800101,,,,,,,,,K1",
      "HO,06130000,a,b,1,100",
      "HS,,,104610104710,5234016,,,2,,,,,",
      "HS,,,,5220064,,,,,,,,",
      "HS,,,,8843836,,,,,,,,",
      "GO,1,100,99",
    ].join("\r\n");
    const r = parseUke(text, opts).receipts[0];
    expect(r.diagnoses.map((d) => d.teeth.length)).toEqual([2, 2, 0]);
    expect(r.karteNo).toBe("K1");
  });

  it("和暦・西暦とも読める", () => {
    expect(toSeireki("50809")).toBe("202609");
    expect(toSeireki("202609")).toBe("202609");
  });

  it("Shift_JIS を読める", () => {
    expect(decodeUke(new Uint8Array([0x83, 0x65, 0x83, 0x58, 0x83, 0x67]))).toBe("テスト");
  });
});

describe("ルールエンジン", () => {
  const { cur, findings } = audit();

  it("問題のない患者には何も出ない", () => {
    for (const k of ["00999", "01000", "01300"]) expect(rulesOf(findings, k)).toEqual([]);
    expect(findings.filter((f) => f.karteNo.startsWith("1"))).toEqual([]);
  });

  it("公式：算定回数限度（歯科疾患管理料 月1回、機械的歯面清掃 月1回）", () => {
    expect(rulesOf(findings, "00456")).toEqual(["official-limit"]);
    const f = findings.find((x) => x.karteNo === "00456")!;
    expect(f.points).toBe(90);
    expect(f.amountYen).toBe(900);
    expect(rulesOf(findings, "00666")).toEqual(["official-limit"]);
  });

  it("公式：併算定背反（歯管と特疾管）", () => {
    const f = findings.filter((x) => x.karteNo === "01100");
    expect(f.map((x) => x.ruleId)).toEqual(["official-exclusive"]);
    expect(f[0].itemName).toBe("歯科疾患管理料");
  });

  it("公式：必須コメント（訪問診療）は返戻", () => {
    const f = findings.find((x) => x.karteNo === "00789")!;
    expect(f.ruleId).toBe("official-comment");
    expect(f.impact).toBe("henrei");
    expect(f.reason).toContain("歯科訪問診療日及び開始時刻");
  });

  it("公式：施設基準（CAD/CAM冠）", () => {
    const f = findings.find((x) => x.karteNo === "00888")!;
    expect(f.ruleId).toBe("official-facility");
    expect(f.reason).toContain("CAD/CAM冠及びCAD/CAMインレー");
  });

  it("公式：年齢制限（10歳に乳幼児加算）", () => {
    expect(rulesOf(findings, "01200")).toContain("official-age");
  });

  it("前提検査なしのSRP＋病名の歯数不足", () => {
    expect(rulesOf(findings, "00123")).toEqual(["diag-srp-perio", "prereq-srp-perio-exam"]);
    expect(findings.find((f) => f.ruleId === "diag-srp-perio")!.reason).toContain("1歯（右下6）");
  });

  it("併算定不可（同日の初診・再診）", () => {
    expect(rulesOf(findings, "00555")).toContain("excl-shoshin-saishin");
  });

  it("病名なしの抜髄", () => {
    expect(rulesOf(findings, "00777")).toEqual(["diag-pulpectomy-pulpitis"]);
  });

  it("施設基準の算定漏れ（届出ありで加算なし）", () => {
    const missed = findings.filter((x) => x.karteNo === "00321");
    expect(missed.map((m) => m.impact)).toEqual(["more", "more"]);
    expect(missed.map((m) => m.itemName)).toEqual(["歯科外来診療医療安全対策加算１（初診）", "歯科外来診療感染対策加算１（初診）"]);
    expect(missed[0].points).toBe(12);
  });

  it("施設基準が未登録なら施設基準の点検はしない", () => {
    const none = audit([]).findings;
    expect(none.some((f) => f.ruleId === "official-facility")).toBe(false);
    expect(none.some((f) => f.ruleId.startsWith("facility-"))).toBe(false);
  });

  it("サマリー", () => {
    const s = summarize(findings, cur.receipts.length);
    expect(s.receiptCount).toBe(37);
    expect(s.henreiCount).toBe(1);
    const ignored = findings.map((f) => (f.karteNo === "00789" ? { ...f, status: "ignored" as const } : f));
    expect(summarize(ignored, 37).henreiCount).toBe(0);
  });

  it("無効にしたルールは動かない", () => {
    const rules = BUILTIN_RULES.map((r) => ({ ...r, enabled: r.id !== "official-limit" }));
    const fs = runRules({ current: cur.receipts, history: [], rules, filedFacility: DEMO_FILED, master });
    expect(fs.some((f) => f.ruleId === "official-limit")).toBe(false);
  });
});

describe("返戻・査定実績", () => {
  const csv = new TextEncoder().encode(
    "年月,区分,項目名,事由,点数\n202501,査定,歯科初診料,A,272\n202502,査定,歯科初診料,A,272\n202503,査定,抜髄（１歯につき）（３根管以上）,病名なし,600\n",
  );
  const rows = parseClaimHistory(csv);

  it("CSVを読む", () => {
    expect(rows).toHaveLength(3);
    expect(rows[0].kind).toBe("satei");
  });

  it("多い順に並べ、ルールと結びつける", () => {
    const r = buildRanking(rows, BUILTIN_RULES);
    expect(r[0]).toMatchObject({ label: "歯科初診料", count: 2, points: 544, ruleId: "excl-shoshin-saishin" });
    expect(r[1].ruleId).toBe("diag-pulpectomy-pulpitis");
  });

  it("優先順位を振り直す", () => {
    const rules = reprioritize(BUILTIN_RULES, rows);
    expect(rules[0].id).toBe("excl-shoshin-saishin");
    expect(rules.map((r) => r.priority)).toEqual(rules.map((_, i) => i + 1));
  });
});

describe("紙レセプトの部位・算定日の入力", () => {
  it("「右下6」「右下5-7」「46」「上顎」「右上E」を歯式コードにする", async () => {
    const { parseTeethInput } = await import("@/lib/teeth");
    expect(parseTeethInput("右下6").codes).toEqual(["104600"]);
    expect(parseTeethInput("右下5-7").codes).toEqual(["104500", "104600", "104700"]);
    expect(parseTeethInput("46、47").codes).toEqual(["104600", "104700"]);
    expect(parseTeethInput("上顎").codes).toEqual(["100100"]);
    expect(parseTeethInput("右上E").codes).toEqual(["105500"]);
    expect(parseTeethInput("右上E").codes.map((c) => teethLabel([c]))).toEqual(["右上E"]);
    expect(parseTeethInput("右下9").bad).toEqual(["右下9"]);
  });

  it("算定日「3,10」「3-5」を読み、読めないものを返す", async () => {
    const { parseDays } = await import("@/lib/paper/types");
    expect(parseDays("3,10").days).toEqual([3, 10]);
    expect(parseDays("３・１０日").days).toEqual([3, 10]);
    expect(parseDays("3-5").days).toEqual([3, 4, 5]);
    expect(parseDays("32").bad).toEqual(["32"]);
  });
});
