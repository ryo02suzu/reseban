import { describe, expect, it } from "vitest";
import { buildIndex } from "@/lib/master/bundle";
import { DEMO_FILED, DEMO_MASTER } from "@/lib/demo";
import { paperToReceipt, findByomei, findShinryo } from "@/lib/paper/convert";
import { normalizePaper } from "@/lib/paper/types";
import { runRules } from "@/lib/rules/engine";
import { BUILTIN_RULES } from "@/lib/rules/builtin";

const master = buildIndex(DEMO_MASTER);
const act = (days: string, name: string, teeth = "", count?: number) => ({ days, name, teeth, comment: "", count });

describe("紙レセプトの手入力", () => {
  it("略称・省略名からマスターを引く", () => {
    expect(findByomei(master, "Pul")?.name).toBe("急性化膿性歯髄炎");
    expect(findByomei(master, "ｐｅｒ")?.abbr).toBe("Ｐｅｒ");
    expect(findShinryo(master, "再診")?.code).toBe("301001610");
    expect(findShinryo(master, "抜髄（３根管以上）")?.code).toBe("309002310");
  });

  it("入力を整え、足りないものは日本語で返す", () => {
    expect(normalizePaper({ month: "202609", patientId: "", acts: [] }).error).toContain("患者ID");
    expect(normalizePaper({ month: "202609", patientId: "1", acts: [act("x", "再診")] }).error).toContain("算定日");
    const ok = normalizePaper({ month: "202609", patientId: "1", sex: "2", age: "40", diagnoses: [{ teeth: "", name: "" }], acts: [act("3", "再診")] });
    expect(ok.value?.age).toBe(40);
    expect(ok.value?.diagnoses).toEqual([]);
  });

  it("レセ電と同じルールで判定する（歯周検査なしのSRP、病名のない抜髄）", () => {
    const srp = paperToReceipt(
      { no: 1, month: "202609", patientId: "P-1", sex: "1", age: 50, memo: "", diagnoses: [{ teeth: "右下6,7", name: "P" }], acts: [act("4", "再診"), act("4", "ＳＲＰ（大臼歯）", "右下6,7", 2)] },
      master,
      "salt",
    );
    const pul = paperToReceipt(
      { no: 2, month: "202609", patientId: "P-2", sex: "2", age: 38, memo: "", diagnoses: [{ teeth: "右上6", name: "C" }], acts: [act("7", "抜髄（３根管以上）", "右上6")] },
      master,
      "salt",
    );
    expect(srp.acts[1].dates).toEqual(["2026-09-04"]);
    expect(srp.acts[1].count).toBe(2);
    const fs = runRules({ current: [srp, pul], history: [], rules: BUILTIN_RULES, filedFacility: DEMO_FILED, master });
    expect(fs.some((f) => f.ruleId === "prereq-srp-perio-exam" && f.receiptNo === "1" && f.payer === "P")).toBe(true);
    expect(fs.some((f) => f.ruleId === "diag-pulpectomy-pulpitis" && f.receiptNo === "2")).toBe(true);
  });
});

describe("答え合わせ", () => {
  it("同じ月・同じ項目（患者IDがあれば同じ患者）の指摘を的中とする", async () => {
    const { compareOutcome } = await import("@/lib/rules/outcome");
    const findings = [
      { id: "a", itemName: "抜髄（１歯につき）（単根管）", karteNo: "P-100", month: "202609" },
      { id: "b", itemName: "歯科再診料", karteNo: "P-200", month: "202609" },
    ];
    const o = compareOutcome("202609", findings, [
      { id: "1", month: "202609", kind: "satei", itemName: "抜髄", reason: "A", points: 234, patientId: "P-100" },
      { id: "2", month: "202609", kind: "satei", itemName: "歯科再診料", reason: "", points: 59, patientId: "P-999" },
      { id: "3", month: "202608", kind: "henrei", itemName: "歯科再診料", reason: "", points: 59 },
    ]);
    expect([o.total, o.caught, o.findingsWithoutClaim]).toEqual([2, 1, 1]);
    expect(o.rows.map((r) => r.findingId)).toEqual(["a", undefined]);
  });
});

describe("紙レセプトのコメント", () => {
  it("摘要を書いてあれば、コメントコードが無くても必須コメント漏れにしない", () => {
    const base = { no: 3, month: "202609", patientId: "P-3", sex: "1" as const, age: 80, memo: "", diagnoses: [{ teeth: "", name: "P" }] };
    const without = paperToReceipt({ ...base, acts: [act("20", "訪問診療１（診療所）")] }, master, "salt");
    const withText = paperToReceipt({ ...base, acts: [{ ...act("20", "訪問診療１（診療所）"), comment: "14:00〜14:30 特養さくら 通院困難" }] }, master, "salt");
    const rules = BUILTIN_RULES.filter((r) => r.kind === "official" && r.table === "comment");
    expect(runRules({ current: [without], history: [], rules, filedFacility: DEMO_FILED, master }).length).toBeGreaterThan(0);
    expect(runRules({ current: [withText], history: [], rules, filedFacility: DEMO_FILED, master })).toEqual([]);
  });
});
