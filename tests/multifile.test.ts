import { beforeAll, describe, expect, it } from "vitest";
import { createClinic, getClinic, saveMaster, updateClinic, type Clinic } from "@/lib/repo/core";
import { DEMO_FILED, DEMO_MASTER } from "@/lib/demo";
import { MASTER_KINDS } from "@/lib/master/types";
import { getMonthReceipts } from "@/lib/repo/runs";
import { runAudit } from "@/lib/audit";
import { demoUke } from "@/lib/demo";
import { receiptLabel } from "@/lib/uke/text";

/** サンプルのレセ電を、審査支払機関を変えて作る（1：社保、2：国保） */
function uke(month: string, payer: "1" | "2") {
  const text = demoUke(month, "202609")
    .split("\r\n")
    .map((l) => (l.startsWith("UK,") || l.startsWith("IR,") ? l.replace(/^(UK|IR),1,/, `$1,${payer},`) : l))
    .join("\r\n");
  return new TextEncoder().encode(text);
}

let clinic: Clinic;
beforeAll(async () => {
  for (const { kind } of MASTER_KINDS) if (DEMO_MASTER[kind]?.length) await saveMaster(kind, kind, DEMO_MASTER[kind], "test");
  clinic = (await updateClinic((await createClinic("複数ファイル歯科")).id, { facilityCodes: DEMO_FILED }))!;
});

describe("1か月分が複数ファイル（社保・国保）に分かれている場合", () => {
  it("当月の社保・国保をまとめて取り込み、レセプト番号が重なっても別の指摘として扱う", async () => {
    const run = await runAudit(clinic, { current: [uke("202609", "1"), uke("202609", "2")], history: [] }, "u1");
    const single = (await getMonthReceipts(clinic.id, "202609"))!.length / 2;
    expect(run.summary.receiptCount).toBe(single * 2);
    expect(run.findings.length).toBeGreaterThan(10);
    expect(new Set(run.findings.map((f) => f.id)).size).toBe(run.findings.length);
    expect(new Set(run.findings.map((f) => f.payer))).toEqual(new Set(["1", "2"]));
    expect(receiptLabel("12", "2")).toBe("国保 12");
  });

  it("あとから片方だけ取り込み直しても、もう片方は消えない", async () => {
    const c = (await getClinic(clinic.id))!;
    await runAudit(c, { current: [uke("202609", "2")], history: [] }, "u1");
    const saved = (await getMonthReceipts(clinic.id, "202609"))!;
    expect(new Set(saved.map((r) => r.payer))).toEqual(new Set(["1", "2"]));
  });

  it("まとめて選んだファイルを月ごとに振り分け、当月は最も新しい月にする", async () => {
    const c = (await getClinic(clinic.id))!;
    const run = await runAudit(c, { current: [uke("202608", "1"), uke("202609", "1")], history: [uke("202607", "1"), uke("202607", "2"), uke("202609", "2")] }, "u1");
    expect(run.targetMonth).toBe("202609");
    expect(run.historyMonths).toEqual(expect.arrayContaining(["202607", "202608"]));
    expect(new Set((await getMonthReceipts(clinic.id, "202607"))!.map((r) => r.payer))).toEqual(new Set(["1", "2"]));
  });

  it("同じファイルを2回選んでも二重に数えない", async () => {
    const c = (await getClinic(clinic.id))!;
    const f = uke("202609", "1");
    const run = await runAudit(c, { current: [f, f], history: [] }, "u1");
    expect(run.warnings.some((w) => w.includes("2回選ばれていた"))).toBe(true);
  });
});
