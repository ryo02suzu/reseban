import { describe, expect, it } from "vitest";
import { parseUke, toSeireki, decodeUke } from "@/lib/uke/parser";
import { runRules, summarize } from "@/lib/rules/engine";
import { BUILTIN_RULES } from "@/lib/rules/builtin";
import { DEMO_FILED, DEMO_MASTER, demoUke } from "@/lib/demo";
import { DEFAULT_FACILITY_STANDARDS } from "@/lib/facility";
import { buildRanking, parseClaimHistory, reprioritize } from "@/lib/rules/ranking";

const master = new Map(DEMO_MASTER.map((e) => [e.code, e]));
const opts = { salt: "t", lookupName: (c: string) => master.get(c)?.name };
const settings = {
  facilityStandards: DEFAULT_FACILITY_STANDARDS.map((name) => ({ name, filed: DEMO_FILED.includes(name) })),
};

function audit() {
  const cur = parseUke(demoUke("202609", "202609"), opts);
  const history = ["202603", "202604", "202605", "202606", "202607", "202608"].flatMap(
    (m) => parseUke(demoUke(m, "202609"), opts).receipts,
  );
  return { cur, findings: runRules({ current: cur.receipts, history, rules: BUILTIN_RULES, settings, master }) };
}

const byKarte = (fs: ReturnType<typeof audit>["findings"], k: string) => fs.filter((f) => f.karteNo === k).map((f) => f.ruleId).sort();

describe("parser", () => {
  it("和暦を西暦に", () => {
    expect(toSeireki("50809")).toBe("202609");
    expect(toSeireki("3550101")).toBe("19800101");
    expect(toSeireki("202609")).toBe("202609");
  });

  it("氏名・保険証番号を保持しない", () => {
    const f = parseUke(demoUke("202609", "202609"), opts);
    const json = JSON.stringify(f);
    expect(json).not.toContain("デモ　患者");
    expect(json).not.toContain("06130000");
    expect(f.month).toBe("202609");
    expect(f.clinicCode).toBe("1234567");
  });

  it("同じ患者は月をまたいで同じキー", () => {
    const a = parseUke(demoUke("202609", "202609"), opts).receipts.find((r) => r.karteNo === "00666")!;
    const b = parseUke(demoUke("202608", "202609"), opts).receipts.find((r) => r.karteNo === "00666")!;
    expect(a.patientKey).toBe(b.patientKey);
  });

  it("算定日・部位・コメントを読む", () => {
    const r = parseUke(demoUke("202609", "202609"), opts).receipts.find((x) => x.karteNo === "01000")!;
    const act = r.acts[0];
    expect(act.name).toBe("歯科訪問診療1");
    expect(act.dates).toEqual(["2026-09-20"]);
    expect(act.comments[0].text).toContain("14時");
  });

  it("Shift_JIS を読める", () => {
    // "テスト" in Shift_JIS
    expect(decodeUke(new Uint8Array([0x83, 0x65, 0x83, 0x58, 0x83, 0x67]))).toBe("テスト");
  });
});

describe("rule engine", () => {
  const { cur, findings } = audit();

  it("問題のない患者には何も出ない", () => {
    expect(byKarte(findings, "00999")).toEqual([]);
    expect(byKarte(findings, "01000")).toEqual([]);
    expect(findings.filter((f) => f.karteNo.startsWith("1"))).toEqual([]);
  });

  it("前提検査なしのSRP＋部位の病名ズレ", () => {
    expect(byKarte(findings, "00123")).toEqual(["diag-srp-perio", "prereq-srp-perio-exam"]);
    expect(findings.find((f) => f.ruleId === "diag-srp-perio")!.reason).toContain("右下7");
  });

  it("回数オーバー（同月）", () => {
    const f = findings.find((x) => x.karteNo === "00456")!;
    expect(f.ruleId).toBe("freq-shikan-month");
    expect(f.points).toBe(100);
    expect(f.amountYen).toBe(1000);
  });

  it("間隔オーバー（前月と合わせて）", () => {
    expect(byKarte(findings, "00666")).toEqual(["freq-pmtc-2months"]);
  });

  it("必須コメント漏れは返戻", () => {
    const f = findings.find((x) => x.karteNo === "00789")!;
    expect(f.ruleId).toBe("comment-houmon-time");
    expect(f.impact).toBe("henrei");
  });

  it("併算定不可", () => {
    expect(byKarte(findings, "00555")).toEqual(["excl-shoshin-saishin"]);
  });

  it("病名なしの抜髄", () => {
    expect(byKarte(findings, "00777")).toEqual(["diag-pulpectomy-pulpitis"]);
  });

  it("施設基準：届出なしで算定／届出ありで未算定", () => {
    expect(byKarte(findings, "00888")).toEqual(["facility-cadcam-required"]);
    const missed = findings.filter((x) => x.karteNo === "00321");
    expect(missed.map((m) => m.impact)).toEqual(["more", "more"]);
    expect(missed[0].points).toBe(12);
  });

  it("サマリー", () => {
    const s = summarize(findings, cur.receipts.length);
    expect(s.henreiCount).toBe(1);
    expect(s.moreYen).toBe(240);
    expect(s.receiptCount).toBe(34);
    const ignored = findings.map((f) => (f.karteNo === "00789" ? { ...f, status: "ignored" as const } : f));
    expect(summarize(ignored, 34).henreiCount).toBe(0);
  });

  it("無効にしたルールは動かない", () => {
    const rules = BUILTIN_RULES.map((r) => ({ ...r, enabled: r.id !== "freq-shikan-month" }));
    const history = parseUke(demoUke("202608", "202609"), opts).receipts;
    const fs = runRules({ current: cur.receipts, history, rules, settings, master });
    expect(fs.some((f) => f.ruleId === "freq-shikan-month")).toBe(false);
  });
});

describe("ranking", () => {
  const csv = new TextEncoder().encode(
    "年月,区分,項目名,事由,点数\n202501,査定,歯科疾患管理料,A,100\n202502,査定,歯科疾患管理料,A,100\n202503,返戻,歯科訪問診療1,コメント不備,1100\n",
  );
  const rows = parseClaimHistory(csv);

  it("CSVを読む", () => {
    expect(rows).toHaveLength(3);
    expect(rows[2].kind).toBe("henrei");
  });

  it("多い順に並べ、ルールと結びつける", () => {
    const r = buildRanking(rows, BUILTIN_RULES);
    expect(r[0]).toMatchObject({ label: "歯科疾患管理料", count: 2, points: 200, ruleId: "freq-shikan-month" });
  });

  it("優先順位を振り直す", () => {
    const rules = reprioritize(BUILTIN_RULES, rows);
    expect(rules[0].id).toBe("freq-shikan-month");
    expect(rules[0].historyCount).toBe(2);
    expect(rules[1].id).toBe("comment-houmon-time");
    expect(rules.map((r) => r.priority)).toEqual(rules.map((_, i) => i + 1));
  });
});
