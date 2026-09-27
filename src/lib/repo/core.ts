import "server-only";
import { and, asc, desc, eq, isNull, lt, sql } from "drizzle-orm";
import { getDb } from "../db";
import { aiUsage, auditLogs, clinics, loginAttempts, masters, tokens, users } from "../db/schema";
import { newId, randomToken, sha256 } from "../security/crypto";
import { buildIndex, EMPTY_INDEX, type MasterIndex } from "../master/bundle";
import type { MasterData, MasterFileStatus, MasterKind } from "../master/types";

export type Clinic = typeof clinics.$inferSelect;
export type User = typeof users.$inferSelect;
export type Role = User["role"];

// ---------- 操作ログ ----------
export interface Actor {
  clinicId?: string | null;
  userId?: string | null;
  userEmail?: string;
  ip?: string;
}

export async function logAction(actor: Actor, action: string, target = "", detail: Record<string, unknown> = {}) {
  const db = await getDb();
  await db.insert(auditLogs).values({
    clinicId: actor.clinicId ?? null,
    userId: actor.userId ?? null,
    userEmail: actor.userEmail ?? "",
    ip: actor.ip ?? "",
    action,
    target,
    detail,
  });
}

export async function listAuditLogs(clinicId: string | null, limit = 200, before?: number) {
  const db = await getDb();
  const conds = [clinicId === null ? sql`true` : eq(auditLogs.clinicId, clinicId)];
  if (before) conds.push(lt(auditLogs.id, before));
  return db
    .select()
    .from(auditLogs)
    .where(and(...conds))
    .orderBy(desc(auditLogs.id))
    .limit(limit);
}

// ---------- 医院 ----------
export async function createClinic(name: string, note = ""): Promise<Clinic> {
  const db = await getDb();
  const [c] = await db
    .insert(clinics)
    .values({ id: newId("c_"), name, note, salt: randomToken(32) })
    .returning();
  return c;
}

export async function getClinic(id: string): Promise<Clinic | null> {
  const db = await getDb();
  const [c] = await db.select().from(clinics).where(eq(clinics.id, id));
  return c ?? null;
}

export async function listClinics(): Promise<Clinic[]> {
  const db = await getDb();
  return db.select().from(clinics).orderBy(asc(clinics.createdAt));
}

export async function updateClinic(
  id: string,
  patch: Partial<Pick<Clinic, "name" | "code" | "status" | "facilityCodes" | "aiEnabled" | "require2fa" | "retentionMonths" | "aiMonthlyLimit" | "note">>,
) {
  const db = await getDb();
  const [c] = await db.update(clinics).set(patch).where(eq(clinics.id, id)).returning();
  return c ?? null;
}

// ---------- ユーザー ----------
export async function getUserByEmail(email: string): Promise<User | null> {
  const db = await getDb();
  const [u] = await db.select().from(users).where(eq(users.email, email.trim().toLowerCase()));
  return u ?? null;
}

export async function getUser(id: string): Promise<User | null> {
  const db = await getDb();
  const [u] = await db.select().from(users).where(eq(users.id, id));
  return u ?? null;
}

export async function listUsers(clinicId: string | null): Promise<User[]> {
  const db = await getDb();
  return db
    .select()
    .from(users)
    .where(clinicId === null ? isNull(users.clinicId) : eq(users.clinicId, clinicId))
    .orderBy(asc(users.createdAt));
}

export async function countUsers(): Promise<number> {
  const db = await getDb();
  const [r] = await db.select({ n: sql<number>`count(*)::int` }).from(users);
  return r.n;
}

export async function createUser(v: { clinicId: string | null; email: string; name: string; role: Role; passwordHash: string; termsVersion?: string }) {
  const db = await getDb();
  const [u] = await db
    .insert(users)
    .values({
      id: newId("u_"),
      clinicId: v.clinicId,
      email: v.email.trim().toLowerCase(),
      name: v.name,
      role: v.role,
      passwordHash: v.passwordHash,
      termsAcceptedAt: v.termsVersion ? new Date() : null,
      termsVersion: v.termsVersion ?? null,
    })
    .returning();
  return u;
}

export async function updateUser(
  id: string,
  patch: Partial<
    Pick<
      User,
      | "name"
      | "passwordHash"
      | "totpSecret"
      | "totpEnabled"
      | "failedLogins"
      | "lockedUntil"
      | "disabled"
      | "lastLoginAt"
      | "termsAcceptedAt"
      | "termsVersion"
      | "passwordChangedAt"
      | "role"
    >
  >,
) {
  const db = await getDb();
  const [u] = await db.update(users).set(patch).where(eq(users.id, id)).returning();
  return u ?? null;
}

// ---------- 招待・再設定リンク ----------
export async function createToken(v: {
  kind: "invite" | "reset";
  clinicId: string | null;
  userId?: string | null;
  role?: Role | null;
  email?: string;
  createdBy: string;
  hours?: number;
}): Promise<string> {
  const token = randomToken(32);
  const db = await getDb();
  await db.insert(tokens).values({
    id: sha256(token),
    kind: v.kind,
    clinicId: v.clinicId,
    userId: v.userId ?? null,
    role: v.role ?? null,
    email: (v.email ?? "").trim().toLowerCase(),
    createdBy: v.createdBy,
    expiresAt: new Date(Date.now() + (v.hours ?? 72) * 3600_000),
  });
  return token;
}

export async function findToken(token: string) {
  const db = await getDb();
  const [t] = await db.select().from(tokens).where(eq(tokens.id, sha256(token)));
  if (!t || t.usedAt || t.expiresAt < new Date()) return null;
  return t;
}

export async function consumeToken(token: string) {
  const db = await getDb();
  const [t] = await db
    .update(tokens)
    .set({ usedAt: new Date() })
    .where(and(eq(tokens.id, sha256(token)), isNull(tokens.usedAt)))
    .returning();
  return t ?? null;
}

// ---------- ログイン試行（IP単位） ----------
const WINDOW_MS = 15 * 60_000;
const MAX_PER_WINDOW = 30;

export async function tooManyAttempts(key: string): Promise<boolean> {
  const db = await getDb();
  const [r] = await db.select().from(loginAttempts).where(eq(loginAttempts.key, key));
  if (!r) return false;
  if (Date.now() - r.windowStart.getTime() > WINDOW_MS) return false;
  return r.count >= MAX_PER_WINDOW;
}

export async function recordAttempt(key: string) {
  const db = await getDb();
  const [r] = await db.select().from(loginAttempts).where(eq(loginAttempts.key, key));
  if (!r || Date.now() - r.windowStart.getTime() > WINDOW_MS) {
    await db
      .insert(loginAttempts)
      .values({ key, count: 1, windowStart: new Date() })
      .onConflictDoUpdate({ target: loginAttempts.key, set: { count: 1, windowStart: new Date() } });
  } else {
    await db.update(loginAttempts).set({ count: r.count + 1 }).where(eq(loginAttempts.key, key));
  }
}

// ---------- AI 利用回数 ----------
export async function consumeAi(clinicId: string, limit: number): Promise<void> {
  const db = await getDb();
  const month = new Date().toISOString().slice(0, 7).replace("-", "");
  const [r] = await db
    .insert(aiUsage)
    .values({ clinicId, month, count: 1 })
    .onConflictDoUpdate({ target: [aiUsage.clinicId, aiUsage.month], set: { count: sql`${aiUsage.count} + 1` } })
    .returning();
  if (r.count > limit) throw new Error(`今月のAI利用回数の上限（${limit}回）に達しました。`);
}

export async function aiUsageByClinic(month: string) {
  const db = await getDb();
  return db.select().from(aiUsage).where(eq(aiUsage.month, month));
}

// ---------- 公式マスター ----------
const masterCache: { version: string; index: MasterIndex } = { version: "", index: EMPTY_INDEX };

export async function saveMaster(kind: MasterKind, fileName: string, data: MasterData[MasterKind], by: string) {
  const db = await getDb();
  const row = { kind, fileName, rowCount: data.length, data, importedBy: by, importedAt: new Date() };
  await db.insert(masters).values(row).onConflictDoUpdate({ target: masters.kind, set: row });
}

export async function masterStatuses(): Promise<MasterFileStatus[]> {
  const db = await getDb();
  const rows = await db
    .select({ kind: masters.kind, count: masters.rowCount, fileName: masters.fileName, importedAt: masters.importedAt })
    .from(masters);
  return rows.map((r) => ({ ...r, importedAt: r.importedAt.toISOString() }));
}

/** 取込済みの公式マスターの索引（取込日時が変わったら作り直す） */
export async function getMasterIndex(): Promise<MasterIndex> {
  const db = await getDb();
  const [v] = await db.select({ v: sql<string>`coalesce(max(${masters.importedAt})::text, '')` }).from(masters);
  if (v.v === masterCache.version) return masterCache.index;
  const rows = await db.select().from(masters);
  const data: Partial<MasterData> = {};
  for (const r of rows) (data as Record<string, unknown>)[r.kind] = r.data;
  masterCache.version = v.v;
  masterCache.index = buildIndex(data);
  return masterCache.index;
}
