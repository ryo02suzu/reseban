import { sql } from "drizzle-orm";
import {
  bigserial,
  boolean,
  customType,
  index,
  integer,
  jsonb,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uniqueIndex,
} from "drizzle-orm/pg-core";
import type { AiSuggestion, AuditSummary, Finding } from "../types";
import type { ClaimHistoryRow, Rule, RuleDraft } from "../rules/types";
import type { MasterData, MasterKind } from "../master/types";

const bytea = customType<{ data: Buffer; driverData: Buffer }>({ dataType: () => "bytea" });

const id = () => text("id").primaryKey();
const createdAt = () => timestamp("created_at", { withTimezone: true }).notNull().defaultNow();

/** 医院（契約単位） */
export const clinics = pgTable("clinics", {
  id: id(),
  name: text("name").notNull(),
  /** 医療機関コード（レセ電から自動取得） */
  code: text("code").notNull().default(""),
  status: text("status", { enum: ["active", "suspended"] }).notNull().default("active"),
  /** 届け出ている施設基準コード */
  facilityCodes: jsonb("facility_codes").$type<string[]>().notNull().default(sql`'[]'::jsonb`),
  aiEnabled: boolean("ai_enabled").notNull().default(false),
  /** 全員に2段階認証を求める */
  require2fa: boolean("require_2fa").notNull().default(false),
  /** レセプトデータの保存期間（月） */
  retentionMonths: integer("retention_months").notNull().default(13),
  /** 患者キーの秘密値（医院ごと） */
  salt: text("salt").notNull(),
  /** 月あたりのAI呼び出し上限 */
  aiMonthlyLimit: integer("ai_monthly_limit").notNull().default(300),
  note: text("note").notNull().default(""),
  createdAt: createdAt(),
});

export const users = pgTable(
  "users",
  {
    id: id(),
    /** 運営者は null */
    clinicId: text("clinic_id").references(() => clinics.id, { onDelete: "cascade" }),
    email: text("email").notNull(),
    name: text("name").notNull(),
    role: text("role", { enum: ["operator", "owner", "staff"] }).notNull(),
    passwordHash: text("password_hash").notNull(),
    totpSecret: text("totp_secret"),
    totpEnabled: boolean("totp_enabled").notNull().default(false),
    failedLogins: integer("failed_logins").notNull().default(0),
    lockedUntil: timestamp("locked_until", { withTimezone: true }),
    disabled: boolean("disabled").notNull().default(false),
    termsAcceptedAt: timestamp("terms_accepted_at", { withTimezone: true }),
    termsVersion: text("terms_version"),
    passwordChangedAt: timestamp("password_changed_at", { withTimezone: true }).notNull().defaultNow(),
    lastLoginAt: timestamp("last_login_at", { withTimezone: true }),
    createdAt: createdAt(),
  },
  (t) => [uniqueIndex("users_email_idx").on(t.email)],
);

export const sessions = pgTable(
  "sessions",
  {
    /** トークンの SHA-256（トークン自体は保存しない） */
    id: id(),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    /** パスワードは通ったが2段階認証がまだ */
    pending2fa: boolean("pending_2fa").notNull().default(false),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    lastSeenAt: timestamp("last_seen_at", { withTimezone: true }).notNull().defaultNow(),
    ip: text("ip").notNull().default(""),
    userAgent: text("user_agent").notNull().default(""),
    createdAt: createdAt(),
  },
  (t) => [index("sessions_user_idx").on(t.userId)],
);

/** 招待・パスワード再設定のリンク（1回限り） */
export const tokens = pgTable("tokens", {
  id: id(),
  kind: text("kind", { enum: ["invite", "reset"] }).notNull(),
  clinicId: text("clinic_id").references(() => clinics.id, { onDelete: "cascade" }),
  userId: text("user_id").references(() => users.id, { onDelete: "cascade" }),
  role: text("role", { enum: ["operator", "owner", "staff"] }),
  email: text("email").notNull().default(""),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  usedAt: timestamp("used_at", { withTimezone: true }),
  createdBy: text("created_by"),
  createdAt: createdAt(),
});

/** 操作ログ（医療情報ガイドラインのアクセス記録） */
export const auditLogs = pgTable(
  "audit_logs",
  {
    id: bigserial("id", { mode: "number" }).primaryKey(),
    clinicId: text("clinic_id"),
    userId: text("user_id"),
    userEmail: text("user_email").notNull().default(""),
    action: text("action").notNull(),
    target: text("target").notNull().default(""),
    detail: jsonb("detail").$type<Record<string, unknown>>().notNull().default(sql`'{}'::jsonb`),
    ip: text("ip").notNull().default(""),
    createdAt: createdAt(),
  },
  (t) => [index("audit_clinic_idx").on(t.clinicId, t.createdAt)],
);

/** 公式マスター（全医院共通。運営者が取り込む） */
export const masters = pgTable("masters", {
  kind: text("kind").$type<MasterKind>().primaryKey(),
  fileName: text("file_name").notNull(),
  rowCount: integer("row_count").notNull(),
  data: jsonb("data").$type<MasterData[MasterKind]>().notNull(),
  importedBy: text("imported_by").notNull().default(""),
  importedAt: createdAt(),
});

/** ルール。clinicId が null なら全医院共通（運営者が管理） */
export const rules = pgTable(
  "rules",
  {
    id: id(),
    clinicId: text("clinic_id").references(() => clinics.id, { onDelete: "cascade" }),
    data: jsonb("data").$type<Rule>().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
    createdAt: createdAt(),
  },
  (t) => [index("rules_clinic_idx").on(t.clinicId)],
);

/** 共通ルールの医院ごとの有効・無効と優先順位・実績件数 */
export const clinicRuleSettings = pgTable(
  "clinic_rule_settings",
  {
    clinicId: text("clinic_id")
      .notNull()
      .references(() => clinics.id, { onDelete: "cascade" }),
    ruleId: text("rule_id").notNull(),
    enabled: boolean("enabled"),
    priority: integer("priority"),
    historyCount: integer("history_count"),
  },
  (t) => [primaryKey({ columns: [t.clinicId, t.ruleId] })],
);

/** AI が作ったルール案（運営者が採否を決める） */
export const ruleDrafts = pgTable("rule_drafts", {
  id: id(),
  data: jsonb("data").$type<RuleDraft>().notNull(),
  createdAt: createdAt(),
});

export const claimHistory = pgTable("claim_history", {
  clinicId: text("clinic_id")
    .primaryKey()
    .references(() => clinics.id, { onDelete: "cascade" }),
  rows: jsonb("rows").$type<ClaimHistoryRow[]>().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

/** 紙レセプトの手入力（氏名等の欄はない。医療情報なので内容は暗号化して保存） */
export const paperReceipts = pgTable(
  "paper_receipts",
  {
    id: id(),
    clinicId: text("clinic_id")
      .notNull()
      .references(() => clinics.id, { onDelete: "cascade" }),
    month: text("month").notNull(),
    /** 月ごとの通し番号 */
    no: integer("no").notNull(),
    payload: bytea("payload").notNull(),
    createdBy: text("created_by"),
    createdAt: createdAt(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("paper_receipts_clinic_month_idx").on(t.clinicId, t.month)],
);

/** 月別レセプト（氏名等は含まないが医療情報なのでアプリ側でも暗号化して保存） */
export const monthReceipts = pgTable(
  "month_receipts",
  {
    clinicId: text("clinic_id")
      .notNull()
      .references(() => clinics.id, { onDelete: "cascade" }),
    month: text("month").notNull(),
    receiptCount: integer("receipt_count").notNull(),
    payload: bytea("payload").notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [primaryKey({ columns: [t.clinicId, t.month] })],
);

export const runs = pgTable(
  "runs",
  {
    id: id(),
    clinicId: text("clinic_id")
      .notNull()
      .references(() => clinics.id, { onDelete: "cascade" }),
    targetMonth: text("target_month").notNull(),
    clinicName: text("clinic_name").notNull(),
    historyMonths: jsonb("history_months").$type<string[]>().notNull(),
    summary: jsonb("summary").$type<AuditSummary>().notNull(),
    warnings: jsonb("warnings").$type<string[]>().notNull(),
    suggestions: jsonb("suggestions").$type<AiSuggestion[]>().notNull().default(sql`'[]'::jsonb`),
    demo: boolean("demo").notNull().default(false),
    /** 取り込み元（uke：レセ電、paper：紙レセプトの手入力） */
    source: text("source", { enum: ["uke", "paper"] }).notNull().default("uke"),
    createdBy: text("created_by").notNull().default(""),
    createdAt: createdAt(),
  },
  (t) => [index("runs_clinic_idx").on(t.clinicId, t.createdAt)],
);

export const findings = pgTable(
  "findings",
  {
    runId: text("run_id")
      .notNull()
      .references(() => runs.id, { onDelete: "cascade" }),
    id: text("id").notNull(),
    clinicId: text("clinic_id").notNull(),
    data: jsonb("data").$type<Omit<Finding, "status" | "memo" | "aiExplanation">>().notNull(),
    status: text("status", { enum: ["open", "fixed", "ignored"] }).notNull().default("open"),
    memo: text("memo").notNull().default(""),
    aiExplanation: text("ai_explanation").notNull().default(""),
    updatedBy: text("updated_by").notNull().default(""),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [primaryKey({ columns: [t.runId, t.id] }), index("findings_clinic_idx").on(t.clinicId)],
);

/** AI 利用回数（医院・月ごと） */
export const aiUsage = pgTable(
  "ai_usage",
  {
    clinicId: text("clinic_id").notNull(),
    month: text("month").notNull(),
    count: integer("count").notNull().default(0),
  },
  (t) => [primaryKey({ columns: [t.clinicId, t.month] })],
);

/** ログイン試行（IP 単位の総当たり対策） */
export const loginAttempts = pgTable("login_attempts", {
  key: text("key").primaryKey(),
  count: integer("count").notNull().default(0),
  windowStart: timestamp("window_start", { withTimezone: true }).notNull().defaultNow(),
});
