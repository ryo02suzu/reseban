import "server-only";
import { randomUUID } from "node:crypto";
import type { AuditRun, Finding } from "./types";
import { parseUke, decodeUke } from "./uke/parser";
import type { ParsedFile, ParsedReceipt } from "./uke/types";
import { runRules, summarize, monthsBack } from "./rules/engine";
import { buildIndex, type MasterIndex } from "./master/bundle";
import { DEMO_FILED, DEMO_MASTER, DEMO_TARGET, demoUke } from "./demo";
import { DEMO_MODE, DEMO_RUN_ID } from "./demo/mode";
import { getMasterIndex, updateClinic, type Clinic } from "./repo/core";
import { listClinicRules } from "./repo/rules";
import { getMonthReceipts, getRun, saveMonthReceipts, saveRun } from "./repo/runs";

export const HISTORY_MONTHS = 6;
export const MAX_UPLOAD_BYTES = 30 * 1024 * 1024;

export function expectedHistoryMonths(target: string): string[] {
  return Array.from({ length: HISTORY_MONTHS }, (_, i) => monthsBack(target, HISTORY_MONTHS - i));
}

let demoIndex: MasterIndex | null = null;
const getDemoIndex = () => (demoIndex ??= buildIndex(DEMO_MASTER));

function masterWarnings(m: MasterIndex): string[] {
  const w: string[] = [];
  if (!m.loaded.has("shinryo")) {
    w.push("歯科診療行為マスターが未取込のため、名称で判定するルールと公式テーブルの点検が動きません。運営者に連絡してください。");
    return w;
  }
  for (const [k, label] of [
    ["limit", "算定回数限度テーブル"],
    ["exclusive", "併算定背反テーブル"],
    ["commentRel", "コメント関連テーブル"],
    ["byomei", "傷病名マスター"],
  ] as const) {
    if (!m.loaded.has(k)) w.push(`${label}が未取込のため、その点検を行っていません。`);
  }
  return w;
}

export async function runAudit(clinic: Clinic, input: { current: Uint8Array; history: Uint8Array[] }, userId: string): Promise<AuditRun> {
  const master = await getMasterIndex();
  const parse = (buf: Uint8Array) => parseUke(decodeUke(buf), { salt: clinic.salt, master });

  const cur = parse(input.current);
  if (!cur.receipts.length) throw new Error("当月ファイルにレセプトが見つかりませんでした。レセ電ファイル（RECEIPTS.UKE）か確認してください。");
  if (clinic.code && cur.clinicCode && clinic.code !== cur.clinicCode) {
    throw new Error(`このファイルは別の医療機関（コード${cur.clinicCode}）のものです。登録されている医療機関コードは${clinic.code}です。`);
  }
  const code = clinic.code || cur.clinicCode;
  const target = cur.month;
  const warnings = [...masterWarnings(master), ...cur.warnings];
  const byMonth = new Map<string, ParsedReceipt[]>();
  for (const buf of input.history) {
    const f = parse(buf);
    if (code && f.clinicCode && f.clinicCode !== code) {
      warnings.push(`過去分に別の医療機関のファイルが入っていたので除外しました（コード${f.clinicCode}）`);
      continue;
    }
    warnings.push(...f.warnings.map((w) => `過去分（${f.month}）：${w}`));
    if (f.month === target) {
      warnings.push("過去分に当月と同じ月のファイルが入っていたので除外しました");
      continue;
    }
    if (f.month > target) {
      warnings.push(`過去分に当月より新しい月（${f.month}）のファイルが入っていたので除外しました`);
      continue;
    }
    byMonth.set(f.month, f.receipts);
    await saveMonthReceipts(clinic.id, f.month, f.receipts);
  }
  await saveMonthReceipts(clinic.id, target, cur.receipts);

  if (!clinic.code && cur.clinicCode) {
    await updateClinic(clinic.id, { code: cur.clinicCode });
  }

  return finish({ clinic, cur, target, byMonth, warnings, master, filed: clinic.facilityCodes, demo: false, userId });
}

export async function runDemoAudit(clinic: Clinic, userId: string, previous?: AuditRun): Promise<AuditRun> {
  const master = getDemoIndex();
  const opts = { salt: "demo", master };
  const cur = parseUke(demoUke(DEMO_TARGET, DEMO_TARGET), opts);
  const byMonth = new Map<string, ParsedReceipt[]>();
  for (const m of expectedHistoryMonths(DEMO_TARGET)) {
    // 過去分が1ヶ月欠けているときの表示を見せるため、7月だけ抜いておく
    if (m === "202607") continue;
    byMonth.set(m, parseUke(demoUke(m, DEMO_TARGET), opts).receipts);
  }
  return finish({
    clinic,
    cur,
    target: DEMO_TARGET,
    byMonth,
    warnings: [],
    master,
    filed: DEMO_FILED,
    demo: true,
    userId,
    previous,
    clinicName: "サンプル歯科医院",
  });
}

/** 保存済みのレセプトを今のルール・マスターでもう一度チェックする */
export async function rerunAudit(clinic: Clinic, id: string, userId: string): Promise<AuditRun | null> {
  const previous = await getRun(clinic.id, id);
  if (!previous) return null;
  if (previous.demo) return runDemoAudit(clinic, userId, previous);
  const receipts = await getMonthReceipts(clinic.id, previous.targetMonth);
  if (!receipts) throw new Error("この月のレセプトデータが保存期間を過ぎて削除されています。もう一度ファイルを取り込んでください。");
  const master = await getMasterIndex();
  return finish({
    clinic,
    cur: { clinicCode: clinic.code, clinicName: previous.clinicName, billingMonth: "", month: previous.targetMonth, todokede: [], receipts, warnings: [], unknownCodes: [] },
    target: previous.targetMonth,
    byMonth: new Map(),
    warnings: masterWarnings(master),
    master,
    filed: clinic.facilityCodes,
    demo: false,
    userId,
    previous,
  });
}

async function finish(args: {
  clinic: Clinic;
  cur: ParsedFile;
  target: string;
  byMonth: Map<string, ParsedReceipt[]>;
  warnings: string[];
  master: MasterIndex;
  filed: string[];
  demo: boolean;
  userId: string;
  previous?: AuditRun;
  clinicName?: string;
}): Promise<AuditRun> {
  const { clinic, cur, target, byMonth, warnings, master } = args;
  const historyMonths: string[] = [];
  const missing: string[] = [];
  const history: ParsedReceipt[] = [];
  for (const m of expectedHistoryMonths(target)) {
    const rec = byMonth.get(m) ?? (args.demo ? null : await getMonthReceipts(clinic.id, m));
    if (rec) {
      history.push(...rec);
      historyMonths.push(m);
    } else missing.push(m);
  }
  if (missing.length) {
    warnings.push(
      `${missing.map((m) => `${Number(m.slice(4))}月`).join("・")}分の過去データがありません。過去6ヶ月分が揃うと、回数・間隔や前提検査をより正確に判定できます。`,
    );
  }
  if (!args.demo && args.filed.length === 0) {
    warnings.push("施設基準の届出が設定画面で登録されていないため、施設基準の点検を行っていません。");
  }

  const rules = await listClinicRules(clinic.id);
  const findings: Finding[] = runRules({ current: cur.receipts, history, rules, filedFacility: args.filed, master });

  // 再チェック時は、同じ指摘の対応状況・メモ・AI説明を引き継ぐ
  const prev = new Map(args.previous?.findings.map((f) => [f.id, f]));
  for (const f of findings) {
    const p = prev.get(f.id);
    if (p && p.ruleId === f.ruleId && p.itemCode === f.itemCode) {
      f.status = p.status;
      f.memo = p.memo;
      f.aiExplanation = p.aiExplanation;
    }
  }

  const run: AuditRun = {
    id: args.previous?.id ?? (args.demo && DEMO_MODE ? DEMO_RUN_ID : `${target}-${randomUUID().slice(0, 8)}`),
    createdAt: new Date().toISOString(),
    targetMonth: target,
    clinicName: args.clinicName ?? (clinic.name || cur.clinicName),
    clinicCode: cur.clinicCode,
    historyMonths,
    summary: summarize(findings, cur.receipts.length),
    findings,
    suggestions: args.previous?.suggestions ?? [],
    warnings,
    demo: args.demo,
  };
  await saveRun(clinic.id, run, args.userId);
  return run;
}
