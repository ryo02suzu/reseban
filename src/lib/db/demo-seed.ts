import "server-only";
import type { Db } from ".";
import { clinics, users } from "./schema";
import { hashPassword } from "../security/crypto";
import { DEMO_FILED } from "../demo";
import { DEMO_ACCOUNTS, DEMO_CLINIC_ID, DEMO_PASSWORD } from "../demo/mode";

/** デモ環境の初期データ（架空の医院と、医院・運営者のアカウント）。ID は固定 */
export async function seedDemo(db: Db, termsVersion: string) {
  await db.insert(clinics).values({
    id: DEMO_CLINIC_ID,
    name: "デモ歯科医院",
    salt: "demo",
    facilityCodes: DEMO_FILED,
    note: "デモ用（架空）",
  });
  const rows = [
    { ...DEMO_ACCOUNTS.owner, clinicId: DEMO_CLINIC_ID, role: "owner" as const },
    { ...DEMO_ACCOUNTS.staff, clinicId: DEMO_CLINIC_ID, role: "staff" as const },
    { ...DEMO_ACCOUNTS.operator, clinicId: null, role: "operator" as const },
  ];
  const passwordHash = await hashPassword(DEMO_PASSWORD);
  for (const r of rows) {
    await db.insert(users).values({ ...r, passwordHash, termsAcceptedAt: new Date(), termsVersion });
  }
}

/** サンプルの公式マスター（抜粋）とチェック結果。リポジトリ関数を使うため、DB の準備ができてから呼ぶ */
export async function seedDemoData() {
  const { DEMO_MASTER } = await import("../demo");
  const { saveMaster, getClinic } = await import("../repo/core");
  const { runDemoAudit } = await import("../audit");
  const { MASTER_KINDS } = await import("../master/types");
  for (const { kind, label } of MASTER_KINDS) {
    const data = DEMO_MASTER[kind];
    if (data?.length) await saveMaster(kind, `サンプル（${label}の抜粋）`, data, "demo");
  }
  const clinic = await getClinic(DEMO_CLINIC_ID);
  if (clinic) await runDemoAudit(clinic, DEMO_ACCOUNTS.owner.id);
}
