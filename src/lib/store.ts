import "server-only";
import { randomBytes } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import type { AuditRun, AuditRunListItem, MasterKind, MasterStatus, Settings } from "./types";
import type { ClaimHistoryRow, Rule, RuleDraft } from "./rules/types";
import type { MasterEntry } from "./master/parse";
import type { ParsedReceipt } from "./uke/types";
import { BUILTIN_RULES } from "./rules/builtin";
import { DEFAULT_FACILITY_STANDARDS } from "./facility";

/**
 * ローカル JSON ファイルによる保存。
 * 氏名・保険証番号はパーサーの段階で捨てているので、ここには入らない。
 * 本番では国内リージョンのストレージ（例：東京リージョンの暗号化ディスク）に置く。
 */
const DATA_DIR = process.env.RESEBAN_DATA_DIR ?? path.join(/*turbopackIgnore: true*/ process.cwd(), "data");

function p(...parts: string[]) {
  return path.join(/*turbopackIgnore: true*/ DATA_DIR, ...parts);
}

function readJson<T>(file: string, fallback: T): T {
  try {
    return JSON.parse(fs.readFileSync(file, "utf8")) as T;
  } catch {
    return fallback;
  }
}

function writeJson(file: string, data: unknown) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const tmp = `${file}.${process.pid}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(data));
  fs.renameSync(tmp, file);
}

const safeId = (id: string) => {
  if (!/^[\w-]+$/.test(id)) throw new Error("不正なIDです");
  return id;
};

// ---------- 秘密値 ----------
export function getSalt(): string {
  const file = p("secret.json");
  const s = readJson<{ salt?: string }>(file, {});
  if (s.salt) return s.salt;
  const salt = randomBytes(32).toString("hex");
  writeJson(file, { salt });
  return salt;
}

// ---------- 設定 ----------
export function getSettings(): Settings {
  return readJson<Settings>(p("settings.json"), {
    clinicName: "",
    clinicCode: "",
    aiEnabled: false,
    facilityStandards: DEFAULT_FACILITY_STANDARDS.map((name) => ({ name, filed: false })),
  });
}

export function saveSettings(s: Settings) {
  writeJson(p("settings.json"), s);
}

// ---------- マスター ----------
export function saveMaster(kind: MasterKind, entries: MasterEntry[], fileName: string, demo = false) {
  writeJson(p("masters", `${kind}.json`), {
    status: { kind, count: entries.length, importedAt: new Date().toISOString(), fileName, demo },
    entries,
  });
}

const masterCache = new Map<MasterKind, { mtime: number; map: Map<string, MasterEntry> }>();

export function getMaster(kind: MasterKind): Map<string, MasterEntry> {
  const file = p("masters", `${kind}.json`);
  let mtime = 0;
  try {
    mtime = fs.statSync(file).mtimeMs;
  } catch {
    return new Map();
  }
  const cached = masterCache.get(kind);
  if (cached && cached.mtime === mtime) return cached.map;
  const data = readJson<{ entries: MasterEntry[] }>(file, { entries: [] });
  const map = new Map(data.entries.map((e) => [e.code, e]));
  masterCache.set(kind, { mtime, map });
  return map;
}

export function getMasterStatuses(): MasterStatus[] {
  return (["shinryo", "byomei", "shishiki", "comment"] as MasterKind[]).map((kind) => {
    const data = readJson<{ status?: MasterStatus }>(p("masters", `${kind}.json`), {});
    return data.status ?? { kind, count: 0 };
  });
}

// ---------- 月別レセプト（過去分として再利用） ----------
export function saveMonthReceipts(month: string, receipts: ParsedReceipt[]) {
  writeJson(p("receipts", `${safeId(month)}.json`), receipts);
}

export function getMonthReceipts(month: string): ParsedReceipt[] | null {
  return readJson<ParsedReceipt[] | null>(p("receipts", `${safeId(month)}.json`), null);
}

export function listStoredMonths(): string[] {
  try {
    return fs
      .readdirSync(p("receipts"))
      .filter((f) => /^\d{6}\.json$/.test(f))
      .map((f) => f.slice(0, 6))
      .sort();
  } catch {
    return [];
  }
}

// ---------- チェック結果 ----------
export function saveRun(run: AuditRun) {
  writeJson(p("runs", `${safeId(run.id)}.json`), run);
}

export function getRun(id: string): AuditRun | null {
  return readJson<AuditRun | null>(p("runs", `${safeId(id)}.json`), null);
}

export function listRuns(): AuditRunListItem[] {
  let files: string[] = [];
  try {
    files = fs.readdirSync(p("runs")).filter((f) => f.endsWith(".json"));
  } catch {
    return [];
  }
  return files
    .map((f) => readJson<AuditRun | null>(p("runs", f), null))
    .filter((r): r is AuditRun => !!r)
    .map((r) => {
      const { findings: _f, suggestions: _s, ...rest } = r;
      void _f;
      void _s;
      return rest;
    })
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

export function deleteRun(id: string) {
  fs.rmSync(p("runs", `${safeId(id)}.json`), { force: true });
}

// ---------- ルール ----------
export function getRules(): Rule[] {
  const saved = readJson<Rule[] | null>(p("rules.json"), null);
  if (!saved) return BUILTIN_RULES.map((r) => ({ ...r }));
  return saved.sort((a, b) => a.priority - b.priority);
}

export function saveRules(rules: Rule[]) {
  writeJson(p("rules.json"), rules);
}

export function getDrafts(): RuleDraft[] {
  return readJson<RuleDraft[]>(p("drafts.json"), []);
}

export function saveDrafts(drafts: RuleDraft[]) {
  writeJson(p("drafts.json"), drafts);
}

export function getClaimHistory(): ClaimHistoryRow[] {
  return readJson<ClaimHistoryRow[]>(p("claim-history.json"), []);
}

export function saveClaimHistory(rows: ClaimHistoryRow[]) {
  writeJson(p("claim-history.json"), rows);
}

// ---------- 全削除 ----------
export function deleteAllData() {
  fs.rmSync(DATA_DIR, { recursive: true, force: true });
  masterCache.clear();
}
