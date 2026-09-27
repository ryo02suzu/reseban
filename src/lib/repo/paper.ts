import "server-only";
import { and, asc, eq, lt, sql } from "drizzle-orm";
import { getDb } from "../db";
import { paperReceipts } from "../db/schema";
import { decrypt, encrypt, newId } from "../security/crypto";
import type { PaperReceipt, PaperReceiptInput } from "../paper/types";

// 紙レセプト（医院ごと。内容は暗号化して保存）
const aad = (clinicId: string, id: string) => `paper:${clinicId}:${id}`;

type Row = typeof paperReceipts.$inferSelect;

function toPaper(clinicId: string, r: Row): PaperReceipt {
  const input = JSON.parse(decrypt(Buffer.from(r.payload), aad(clinicId, r.id)).toString("utf8")) as PaperReceiptInput;
  return { ...input, month: r.month, id: r.id, no: r.no, updatedAt: r.updatedAt.toISOString() };
}

export async function listPaper(clinicId: string, month: string): Promise<PaperReceipt[]> {
  const db = await getDb();
  const rows = await db
    .select()
    .from(paperReceipts)
    .where(and(eq(paperReceipts.clinicId, clinicId), eq(paperReceipts.month, month)))
    .orderBy(asc(paperReceipts.no));
  return rows.map((r) => toPaper(clinicId, r));
}

/** 入力のある月と件数 */
export async function paperMonths(clinicId: string): Promise<{ month: string; count: number }[]> {
  const db = await getDb();
  return db
    .select({ month: paperReceipts.month, count: sql<number>`count(*)::int` })
    .from(paperReceipts)
    .where(eq(paperReceipts.clinicId, clinicId))
    .groupBy(paperReceipts.month)
    .orderBy(asc(paperReceipts.month));
}

export async function getPaper(clinicId: string, id: string): Promise<PaperReceipt | null> {
  const db = await getDb();
  const [r] = await db.select().from(paperReceipts).where(and(eq(paperReceipts.clinicId, clinicId), eq(paperReceipts.id, id)));
  return r ? toPaper(clinicId, r) : null;
}

export async function createPaper(clinicId: string, input: PaperReceiptInput, by: string, fixedId?: string): Promise<PaperReceipt> {
  const db = await getDb();
  const id = fixedId ?? newId("p_");
  return db.transaction(async (tx) => {
    const [m] = await tx
      .select({ no: sql<number>`coalesce(max(${paperReceipts.no}), 0)::int` })
      .from(paperReceipts)
      .where(and(eq(paperReceipts.clinicId, clinicId), eq(paperReceipts.month, input.month)));
    const [r] = await tx
      .insert(paperReceipts)
      .values({ id, clinicId, month: input.month, no: m.no + 1, payload: encrypt(JSON.stringify(input), aad(clinicId, id)), createdBy: by })
      .returning();
    return toPaper(clinicId, r);
  });
}

export async function updatePaper(clinicId: string, id: string, input: PaperReceiptInput): Promise<PaperReceipt | null> {
  const db = await getDb();
  const current = await getPaper(clinicId, id);
  if (!current) return null;
  if (current.month !== input.month) {
    // 月を変えたときは、移動先の月の通し番号を振り直す
    await deletePaper(clinicId, id);
    return createPaper(clinicId, input, "");
  }
  const [r] = await db
    .update(paperReceipts)
    .set({ payload: encrypt(JSON.stringify(input), aad(clinicId, id)), updatedAt: new Date() })
    .where(and(eq(paperReceipts.clinicId, clinicId), eq(paperReceipts.id, id)))
    .returning();
  return r ? toPaper(clinicId, r) : null;
}

export async function deletePaper(clinicId: string, id: string): Promise<boolean> {
  const db = await getDb();
  const r = await db
    .delete(paperReceipts)
    .where(and(eq(paperReceipts.clinicId, clinicId), eq(paperReceipts.id, id)))
    .returning({ id: paperReceipts.id });
  return r.length > 0;
}

/** 保存期間を過ぎた紙レセプトを消す */
export async function purgeOldPaper(clinicId: string, beforeMonth: string) {
  const db = await getDb();
  const r = await db
    .delete(paperReceipts)
    .where(and(eq(paperReceipts.clinicId, clinicId), lt(paperReceipts.month, beforeMonth)))
    .returning({ id: paperReceipts.id });
  return r.length;
}
