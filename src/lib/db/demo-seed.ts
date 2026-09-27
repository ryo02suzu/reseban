import "server-only";
import type { Db } from ".";
import { clinics, users } from "./schema";
import { hashPassword, newId, randomToken } from "../security/crypto";
import { DEMO_FILED } from "../demo";
import { DEMO_ACCOUNTS } from "../demo/mode";

/** デモ環境の初期データ（架空の医院と、医院・運営者のアカウント） */
export async function seedDemo(db: Db, termsVersion: string) {
  const clinicId = newId("c_");
  await db.insert(clinics).values({
    id: clinicId,
    name: "デモ歯科医院",
    salt: randomToken(32),
    facilityCodes: DEMO_FILED,
    note: "デモ用（架空）",
  });
  const now = new Date();
  const base = { termsAcceptedAt: now, termsVersion };
  const rows = [
    { ...DEMO_ACCOUNTS.owner, clinicId, role: "owner" as const },
    { ...DEMO_ACCOUNTS.staff, clinicId, role: "staff" as const },
    { ...DEMO_ACCOUNTS.operator, clinicId: null, role: "operator" as const },
  ];
  for (const r of rows) {
    await db.insert(users).values({
      id: newId("u_"),
      clinicId: r.clinicId,
      email: r.email,
      name: r.name,
      role: r.role,
      passwordHash: await hashPassword(r.password),
      ...base,
    });
  }
}
