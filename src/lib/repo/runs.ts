import "server-only";
import { and, asc, desc, eq, lt, sql } from "drizzle-orm";
import { gunzipSync, gzipSync } from "node:zlib";
import { getDb } from "../db";
import { findings as findingsT, monthReceipts, runs } from "../db/schema";
import { decrypt, encrypt } from "../security/crypto";
import { summarize } from "../rules/engine";
import type { AiSuggestion, AuditRun, AuditRunListItem, Finding, FindingStatus } from "../types";
import type { ParsedReceipt } from "../uke/types";

// ---------- 月別レセプト（暗号化） ----------
const aad = (clinicId: string, month: string) => `receipts:${clinicId}:${month}`;

export async function saveMonthReceipts(clinicId: string, month: string, receipts: ParsedReceipt[]) {
  const db = await getDb();
  const payload = encrypt(gzipSync(JSON.stringify(receipts)), aad(clinicId, month));
  await db
    .insert(monthReceipts)
    .values({ clinicId, month, receiptCount: receipts.length, payload })
    .onConflictDoUpdate({
      target: [monthReceipts.clinicId, monthReceipts.month],
      set: { payload, receiptCount: receipts.length, updatedAt: new Date() },
    });
}

/**
 * 月のレセプトを、取り込んだ審査支払機関（社保・国保）の分だけ入れ替えて保存する。
 * 社保と国保を別々に取り込んでも、もう片方は消えない。
 */
export async function mergeMonthReceipts(clinicId: string, month: string, receipts: ParsedReceipt[]) {
  const payers = new Set(receipts.map((r) => r.payer ?? ""));
  const existing = (await getMonthReceipts(clinicId, month)) ?? [];
  const kept = existing.filter((r) => !payers.has(r.payer ?? ""));
  await saveMonthReceipts(clinicId, month, [...kept, ...receipts]);
}

export async function getMonthReceipts(clinicId: string, month: string): Promise<ParsedReceipt[] | null> {
  const db = await getDb();
  const [r] = await db
    .select({ payload: monthReceipts.payload })
    .from(monthReceipts)
    .where(and(eq(monthReceipts.clinicId, clinicId), eq(monthReceipts.month, month)));
  if (!r) return null;
  return JSON.parse(gunzipSync(decrypt(Buffer.from(r.payload), aad(clinicId, month))).toString("utf8"));
}

export async function listStoredMonths(clinicId: string): Promise<string[]> {
  const db = await getDb();
  const rows = await db
    .select({ month: monthReceipts.month })
    .from(monthReceipts)
    .where(eq(monthReceipts.clinicId, clinicId))
    .orderBy(asc(monthReceipts.month));
  return rows.map((r) => r.month);
}

/** 保存期間を過ぎたレセプトを消す */
export async function purgeOldReceipts(clinicId: string, beforeMonth: string) {
  const db = await getDb();
  const r = await db
    .delete(monthReceipts)
    .where(and(eq(monthReceipts.clinicId, clinicId), lt(monthReceipts.month, beforeMonth)))
    .returning({ month: monthReceipts.month });
  return r.length;
}

// ---------- チェック結果 ----------
export async function saveRun(clinicId: string, run: AuditRun, createdBy: string) {
  const db = await getDb();
  await db.transaction(async (tx) => {
    await tx.delete(runs).where(and(eq(runs.id, run.id), eq(runs.clinicId, clinicId)));
    await tx.insert(runs).values({
      id: run.id,
      clinicId,
      targetMonth: run.targetMonth,
      clinicName: run.clinicName,
      historyMonths: run.historyMonths,
      summary: run.summary,
      warnings: run.warnings,
      suggestions: run.suggestions,
      demo: !!run.demo,
      createdBy,
      createdAt: new Date(run.createdAt),
    });
    for (let i = 0; i < run.findings.length; i += 500) {
      const chunk = run.findings.slice(i, i + 500);
      await tx.insert(findingsT).values(
        chunk.map((f) => {
          const { status, memo, aiExplanation, ...data } = f;
          return { runId: run.id, id: f.id, clinicId, data, status, memo: memo ?? "", aiExplanation: aiExplanation ?? "" };
        }),
      );
    }
  });
}

export async function getRun(clinicId: string, id: string): Promise<AuditRun | null> {
  const db = await getDb();
  const [r] = await db.select().from(runs).where(and(eq(runs.id, id), eq(runs.clinicId, clinicId)));
  if (!r) return null;
  const fs = await db.select().from(findingsT).where(and(eq(findingsT.runId, id), eq(findingsT.clinicId, clinicId)));
  return {
    id: r.id,
    createdAt: r.createdAt.toISOString(),
    targetMonth: r.targetMonth,
    clinicName: r.clinicName,
    clinicCode: "",
    historyMonths: r.historyMonths,
    summary: r.summary,
    warnings: r.warnings,
    suggestions: r.suggestions,
    demo: r.demo,
    findings: fs.map((f) => ({ ...f.data, status: f.status, memo: f.memo || undefined, aiExplanation: f.aiExplanation || undefined })),
  };
}

export async function listRuns(clinicId: string): Promise<AuditRunListItem[]> {
  const db = await getDb();
  const rows = await db.select().from(runs).where(eq(runs.clinicId, clinicId)).orderBy(desc(runs.createdAt));
  return rows.map((r) => ({
    id: r.id,
    createdAt: r.createdAt.toISOString(),
    targetMonth: r.targetMonth,
    clinicName: r.clinicName,
    clinicCode: "",
    historyMonths: r.historyMonths,
    summary: r.summary,
    warnings: r.warnings,
    demo: r.demo,
  }));
}

export async function deleteRun(clinicId: string, id: string) {
  const db = await getDb();
  await db.delete(runs).where(and(eq(runs.id, id), eq(runs.clinicId, clinicId)));
}

export async function purgeOldRuns(clinicId: string, before: Date) {
  const db = await getDb();
  const r = await db.delete(runs).where(and(eq(runs.clinicId, clinicId), lt(runs.createdAt, before))).returning({ id: runs.id });
  return r.length;
}

async function recomputeSummary(clinicId: string, runId: string) {
  const db = await getDb();
  const [r] = await db.select({ summary: runs.summary }).from(runs).where(and(eq(runs.id, runId), eq(runs.clinicId, clinicId)));
  const fs = await db.select().from(findingsT).where(and(eq(findingsT.runId, runId), eq(findingsT.clinicId, clinicId)));
  const summary = summarize(
    fs.map((f) => ({ ...f.data, status: f.status })),
    r.summary.receiptCount,
  );
  await db.update(runs).set({ summary }).where(eq(runs.id, runId));
  return summary;
}

export async function updateFinding(
  clinicId: string,
  runId: string,
  findingId: string,
  patch: { status?: FindingStatus; memo?: string; aiExplanation?: string },
  by: string,
): Promise<{ finding: Finding; summary: AuditRun["summary"] } | null> {
  const db = await getDb();
  const set: Record<string, unknown> = { updatedBy: by, updatedAt: new Date() };
  if (patch.status) set.status = patch.status;
  if (patch.memo !== undefined) set.memo = patch.memo;
  if (patch.aiExplanation !== undefined) set.aiExplanation = patch.aiExplanation;
  const [f] = await db
    .update(findingsT)
    .set(set)
    .where(and(eq(findingsT.runId, runId), eq(findingsT.id, findingId), eq(findingsT.clinicId, clinicId)))
    .returning();
  if (!f) return null;
  const summary = patch.status ? await recomputeSummary(clinicId, runId) : (await getRunSummary(clinicId, runId))!;
  return { finding: { ...f.data, status: f.status, memo: f.memo || undefined, aiExplanation: f.aiExplanation || undefined }, summary };
}

async function getRunSummary(clinicId: string, runId: string) {
  const db = await getDb();
  const [r] = await db.select({ summary: runs.summary }).from(runs).where(and(eq(runs.id, runId), eq(runs.clinicId, clinicId)));
  return r?.summary ?? null;
}

export async function getFinding(clinicId: string, runId: string, findingId: string): Promise<Finding | null> {
  const db = await getDb();
  const [f] = await db
    .select()
    .from(findingsT)
    .where(and(eq(findingsT.runId, runId), eq(findingsT.id, findingId), eq(findingsT.clinicId, clinicId)));
  return f ? { ...f.data, status: f.status, memo: f.memo || undefined, aiExplanation: f.aiExplanation || undefined } : null;
}

export async function setSuggestions(clinicId: string, runId: string, suggestions: AiSuggestion[]) {
  const db = await getDb();
  await db
    .update(runs)
    .set({ suggestions })
    .where(and(eq(runs.id, runId), eq(runs.clinicId, clinicId)));
}

export async function runCounts(): Promise<{ clinicId: string; runs: number; last: string | null }[]> {
  const db = await getDb();
  const rows = await db
    .select({ clinicId: runs.clinicId, runs: sql<number>`count(*)::int`, last: sql<string | null>`max(${runs.createdAt})::text` })
    .from(runs)
    .groupBy(runs.clinicId);
  return rows;
}
