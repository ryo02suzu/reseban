import "server-only";
import { and, eq, isNull, desc } from "drizzle-orm";
import { getDb } from "../db";
import { claimHistory, clinicRuleSettings, ruleDrafts, rules } from "../db/schema";
import { BUILTIN_RULES } from "../rules/builtin";
import type { ClaimHistoryRow, Rule, RuleDraft } from "../rules/types";
import { reprioritize } from "../rules/ranking";
import { newId, sha256 } from "../security/crypto";

export type ScopedRule = Rule & { origin: "global" | "clinic" };

let seeded = false;

/** 初期ルールのうち、まだ無いものを共通ルールとして登録する（運営者の編集は上書きしない） */
async function seedGlobal() {
  if (seeded) return;
  const db = await getDb();
  const existing = new Set((await db.select({ id: rules.id }).from(rules).where(isNull(rules.clinicId))).map((r) => r.id));
  const missing = BUILTIN_RULES.filter((r) => !existing.has(r.id));
  if (missing.length) await db.insert(rules).values(missing.map((r) => ({ id: r.id, clinicId: null, data: r }))).onConflictDoNothing();
  seeded = true;
}

export async function listGlobalRules(): Promise<Rule[]> {
  await seedGlobal();
  const db = await getDb();
  const rows = await db.select().from(rules).where(isNull(rules.clinicId));
  return rows.map((r) => r.data).sort((a, b) => a.priority - b.priority);
}

/** 医院から見たルール一覧（共通ルール＋医院の設定、医院独自ルール） */
export async function listClinicRules(clinicId: string): Promise<ScopedRule[]> {
  await seedGlobal();
  const db = await getDb();
  const [globalRows, own, settings] = await Promise.all([
    db.select().from(rules).where(isNull(rules.clinicId)),
    db.select().from(rules).where(eq(rules.clinicId, clinicId)),
    db.select().from(clinicRuleSettings).where(eq(clinicRuleSettings.clinicId, clinicId)),
  ]);
  const s = new Map(settings.map((x) => [x.ruleId, x]));
  const out: ScopedRule[] = [
    ...globalRows.map((r) => {
      const o = s.get(r.id);
      return {
        ...r.data,
        enabled: r.data.enabled && (o?.enabled ?? true),
        priority: o?.priority ?? r.data.priority,
        historyCount: o?.historyCount ?? undefined,
        origin: "global" as const,
      } as ScopedRule;
    }),
    ...own.map((r) => {
      const o = s.get(r.id);
      return { ...r.data, priority: o?.priority ?? r.data.priority, historyCount: o?.historyCount ?? r.data.historyCount, origin: "clinic" as const } as ScopedRule;
    }),
  ];
  return out.sort((a, b) => a.priority - b.priority);
}

/** 共通ルールを運営者が無効にしている場合は医院側で有効にできない */
export async function setClinicRuleEnabled(clinicId: string, ruleId: string, enabled: boolean) {
  const db = await getDb();
  const [own] = await db.select().from(rules).where(and(eq(rules.id, ruleId), eq(rules.clinicId, clinicId)));
  if (own) {
    await db.update(rules).set({ data: { ...own.data, enabled }, updatedAt: new Date() }).where(eq(rules.id, ruleId));
    return;
  }
  const [g] = await db.select().from(rules).where(and(eq(rules.id, ruleId), isNull(rules.clinicId)));
  if (!g) throw new Error("ルールが見つかりません");
  if (enabled && !g.data.enabled) throw new Error("このルールは運営者が停止中です");
  await db
    .insert(clinicRuleSettings)
    .values({ clinicId, ruleId, enabled })
    .onConflictDoUpdate({ target: [clinicRuleSettings.clinicId, clinicRuleSettings.ruleId], set: { enabled } });
}

export async function upsertClinicRule(clinicId: string, rule: Rule) {
  const db = await getDb();
  const [g] = await db.select({ id: rules.id }).from(rules).where(and(eq(rules.id, rule.id), isNull(rules.clinicId)));
  if (g) throw new Error("共通ルールは医院側では編集できません（運営者に依頼してください）");
  const r = await db
    .insert(rules)
    .values({ id: rule.id, clinicId, data: rule })
    .onConflictDoUpdate({ target: rules.id, set: { data: rule, updatedAt: new Date() }, where: eq(rules.clinicId, clinicId) })
    .returning({ id: rules.id });
  if (!r.length) throw new Error("このルールは編集できません");
}

export async function deleteClinicRule(clinicId: string, ruleId: string) {
  const db = await getDb();
  const r = await db.delete(rules).where(and(eq(rules.id, ruleId), eq(rules.clinicId, clinicId))).returning();
  if (!r.length) throw new Error("医院で追加したルールだけ削除できます");
}

export async function getClaimHistory(clinicId: string): Promise<ClaimHistoryRow[]> {
  const db = await getDb();
  const [r] = await db.select().from(claimHistory).where(eq(claimHistory.clinicId, clinicId));
  // 以前の取込分には id が無いので、読むときに振る（内容から決まる値にして、読むたびに変わらないようにする）
  return (r?.rows ?? []).map((row, i) => (row.id ? row : { ...row, id: `h${i}-${sha256(JSON.stringify(row)).slice(0, 8)}` }));
}

export async function saveClaimHistory(clinicId: string, input: ClaimHistoryRow[]) {
  const rows = input.map((r) => (r.id ? r : { ...r, id: newId("h_") }));
  const db = await getDb();
  await db
    .insert(claimHistory)
    .values({ clinicId, rows })
    .onConflictDoUpdate({ target: claimHistory.clinicId, set: { rows, updatedAt: new Date() } });
}

/** 実績を1件追加する */
export async function addClaimHistoryRow(clinicId: string, row: ClaimHistoryRow): Promise<ClaimHistoryRow> {
  const added = { ...row, id: newId("h_") };
  await saveClaimHistory(clinicId, [...(await getClaimHistory(clinicId)), added]);
  return added;
}

/** 実績を1件消す */
export async function deleteClaimHistoryRow(clinicId: string, id: string): Promise<boolean> {
  const rows = await getClaimHistory(clinicId);
  const next = rows.filter((r) => r.id !== id);
  if (next.length === rows.length) return false;
  await saveClaimHistory(clinicId, next);
  return true;
}

/** 実績の多い順に、この医院での優先順位を付け直す */
export async function reprioritizeClinic(clinicId: string): Promise<ScopedRule[]> {
  const rows = await getClaimHistory(clinicId);
  if (!rows.length) throw new Error("先に実績CSVを取り込んでください");
  const current = await listClinicRules(clinicId);
  const next = reprioritize(current as Rule[], rows);
  const db = await getDb();
  await db.transaction(async (tx) => {
    for (const r of next) {
      await tx
        .insert(clinicRuleSettings)
        .values({ clinicId, ruleId: r.id, priority: r.priority, historyCount: r.historyCount ?? 0 })
        .onConflictDoUpdate({
          target: [clinicRuleSettings.clinicId, clinicRuleSettings.ruleId],
          set: { priority: r.priority, historyCount: r.historyCount ?? 0 },
        });
    }
  });
  return listClinicRules(clinicId);
}

// ---------- 共通ルール（運営者） ----------
export async function upsertGlobalRule(rule: Rule) {
  const db = await getDb();
  await db
    .insert(rules)
    .values({ id: rule.id, clinicId: null, data: rule })
    .onConflictDoUpdate({ target: rules.id, set: { data: rule, updatedAt: new Date() }, where: isNull(rules.clinicId) });
}

export async function deleteGlobalRule(ruleId: string) {
  const db = await getDb();
  const [r] = await db.select().from(rules).where(and(eq(rules.id, ruleId), isNull(rules.clinicId)));
  if (!r) throw new Error("ルールが見つかりません");
  if (r.data.source === "builtin" || r.data.source === "official") throw new Error("初期ルール・公式テーブルのルールは削除できません。無効にしてください。");
  await db.delete(rules).where(eq(rules.id, ruleId));
}

export async function listDrafts(): Promise<RuleDraft[]> {
  const db = await getDb();
  return (await db.select().from(ruleDrafts).orderBy(desc(ruleDrafts.createdAt))).map((r) => r.data);
}

export async function saveDraft(d: RuleDraft) {
  const db = await getDb();
  await db.insert(ruleDrafts).values({ id: d.id, data: d }).onConflictDoUpdate({ target: ruleDrafts.id, set: { data: d } });
}

export async function getDraft(id: string): Promise<RuleDraft | null> {
  const db = await getDb();
  const [r] = await db.select().from(ruleDrafts).where(eq(ruleDrafts.id, id));
  return r?.data ?? null;
}
