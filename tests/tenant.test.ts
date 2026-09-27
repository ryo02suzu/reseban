import { beforeAll, describe, expect, it } from "vitest";
import { createClinic, createUser, getMasterIndex, type Clinic } from "@/lib/repo/core";
import { getMonthReceipts, getRun, listRuns, saveMonthReceipts, updateFinding, deleteRun } from "@/lib/repo/runs";
import { listClinicRules, setClinicRuleEnabled, upsertClinicRule } from "@/lib/repo/rules";
import { runDemoAudit, rerunAudit } from "@/lib/audit";
import { hashPassword } from "@/lib/security/crypto";
import { getDb } from "@/lib/db";
import { monthReceipts } from "@/lib/db/schema";
import { validateRule } from "@/lib/rules/validate";

let a: Clinic;
let b: Clinic;

beforeAll(async () => {
  a = await createClinic("A歯科");
  b = await createClinic("B歯科");
  await createUser({ clinicId: a.id, email: "owner@a.example", name: "A院長", role: "owner", passwordHash: await hashPassword("Password-12345") });
});

describe("医院ごとのデータ分離", () => {
  it("他の医院のチェック結果は見えず、更新・削除もできない", async () => {
    const run = await runDemoAudit(a, "u1");
    expect((await getRun(a.id, run.id))?.findings.length).toBeGreaterThan(5);
    expect(await getRun(b.id, run.id)).toBeNull();
    expect(await listRuns(b.id)).toEqual([]);
    expect(await updateFinding(b.id, run.id, run.findings[0].id, { status: "ignored" }, "x")).toBeNull();
    await deleteRun(b.id, run.id);
    expect(await getRun(a.id, run.id)).not.toBeNull();
  });

  it("対応状況の変更でサマリーが更新され、再チェックでも引き継がれる", async () => {
    const run = await runDemoAudit(a, "u1");
    const henrei = run.findings.find((f) => f.impact === "henrei")!;
    const res = await updateFinding(a.id, run.id, henrei.id, { status: "ignored", memo: "確認済み" }, "u1");
    expect(res?.summary.henreiCount).toBe(run.summary.henreiCount - 1);
    const again = await rerunAudit(a, run.id, "u1");
    const f = again!.findings.find((x) => x.id === henrei.id)!;
    expect([f.status, f.memo]).toEqual(["ignored", "確認済み"]);
  });

  it("レセプトは暗号化して保存され、他の医院からは読めない", async () => {
    await saveMonthReceipts(a.id, "202601", [
      { receiptNo: "1", month: "202601", receiptType: "3112", inpatient: false, karteNo: "K-SECRET-1", patientKey: "k", sex: "1", ageStart: 40, ageEnd: 40, totalPoints: 0, todokede: [], patientStates: [], diagnoses: [], acts: [] },
    ]);
    expect((await getMonthReceipts(a.id, "202601"))?.[0].karteNo).toBe("K-SECRET-1");
    expect(await getMonthReceipts(b.id, "202601")).toBeNull();
    const db = await getDb();
    const rows = await db.select().from(monthReceipts);
    for (const r of rows) expect(Buffer.from(r.payload).includes(Buffer.from("K-SECRET-1"))).toBe(false);
  });

  it("ルールの有効・無効は医院ごと、独自ルールは他院に見えない", async () => {
    await setClinicRuleEnabled(a.id, "official-limit", false);
    expect((await listClinicRules(a.id)).find((r) => r.id === "official-limit")?.enabled).toBe(false);
    expect((await listClinicRules(b.id)).find((r) => r.id === "official-limit")?.enabled).toBe(true);
    const own = validateRule({
      name: "A院独自",
      kind: "frequency",
      impact: "satei",
      basis: "b",
      fix: "f",
      target: { names: ["充填"] },
      max: 1,
      per: "day",
    });
    await upsertClinicRule(a.id, own);
    expect((await listClinicRules(a.id)).some((r) => r.id === own.id)).toBe(true);
    expect((await listClinicRules(b.id)).some((r) => r.id === own.id)).toBe(false);
    await expect(upsertClinicRule(b.id, { ...own })).rejects.toThrow();
  });

  it("マスター未取込でも落ちない", async () => {
    expect((await getMasterIndex()).shinryo.size).toBe(0);
  });
});
