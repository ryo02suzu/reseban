import "server-only";
import { randomUUID } from "node:crypto";
import type { AuditRun } from "./types";
import { parseUke, decodeUke } from "./uke/parser";
import type { ParsedFile, ParsedReceipt } from "./uke/types";
import { runRules, summarize, monthsBack } from "./rules/engine";
import type { MasterEntry } from "./master/parse";
import { DEMO_FILED, DEMO_MASTER, demoUke } from "./demo";
import * as store from "./store";

export const HISTORY_MONTHS = 6;

export function expectedHistoryMonths(target: string): string[] {
  return Array.from({ length: HISTORY_MONTHS }, (_, i) => monthsBack(target, HISTORY_MONTHS - i));
}

interface AuditInput {
  current: Uint8Array;
  history: Uint8Array[];
}

export function runAudit(input: AuditInput): AuditRun {
  const master = store.getMaster("shinryo");
  const settings = store.getSettings();
  const salt = store.getSalt();
  const parse = (buf: Uint8Array) => parseUke(decodeUke(buf), { salt, lookupName: (c) => master.get(c)?.name });

  const cur = parse(input.current);
  if (!cur.receipts.length) throw new Error("当月ファイルにレセプトが見つかりませんでした。レセ電ファイル（.UKE）か確認してください。");
  const target = cur.month;

  // 過去分：今回渡されたもの＋前回までに保存したもの
  const warnings = [...cur.warnings];
  const byMonth = new Map<string, ParsedReceipt[]>();
  for (const buf of input.history) {
    const f = parse(buf);
    warnings.push(...f.warnings.map((w) => `過去分：${w}`));
    if (f.month === target) {
      warnings.push("過去分に当月と同じ月のファイルが入っていたので除外しました");
      continue;
    }
    byMonth.set(f.month, f.receipts);
    store.saveMonthReceipts(f.month, f.receipts);
  }
  store.saveMonthReceipts(target, cur.receipts);

  if (!settings.clinicCode && cur.clinicCode) {
    store.saveSettings({ ...settings, clinicCode: cur.clinicCode, clinicName: settings.clinicName || cur.clinicName });
  }

  if (master.size === 0) {
    warnings.unshift("歯科診療行為マスターが未取込です。名称で判定するルールが動きません。設定画面からマスターを取り込んでください。");
  }

  return finish({
    cur,
    target,
    byMonth,
    warnings,
    master,
    filed: settings.facilityStandards,
    clinicName: settings.clinicName || cur.clinicName,
    demo: false,
  });
}

/** 保存済みのレセプトを今のルールでもう一度チェックする */
export function rerunAudit(id: string): AuditRun | null {
  const previous = store.getRun(id);
  if (!previous) return null;
  if (previous.demo) return runDemoAudit(previous);
  const receipts = store.getMonthReceipts(previous.targetMonth);
  if (!receipts) throw new Error("この月のレセプトデータが残っていません。もう一度ファイルを取り込んでください。");
  const master = store.getMaster("shinryo");
  const settings = store.getSettings();
  const warnings: string[] = [];
  if (master.size === 0) warnings.push("歯科診療行為マスターが未取込です。名称で判定するルールが動きません。設定画面からマスターを取り込んでください。");
  return finish({
    cur: { clinicCode: previous.clinicCode, clinicName: previous.clinicName, billingMonth: "", month: previous.targetMonth, receipts, warnings: [] },
    target: previous.targetMonth,
    byMonth: new Map(),
    warnings,
    master,
    filed: settings.facilityStandards,
    clinicName: previous.clinicName,
    demo: false,
    previous,
  });
}

export function runDemoAudit(previous?: AuditRun): AuditRun {
  const target = "202609";
  const master = new Map(DEMO_MASTER.map((e) => [e.code, e]));
  const opts = { salt: "demo", lookupName: (c: string) => master.get(c)?.name };
  const cur = parseUke(demoUke(target, target), opts);
  const byMonth = new Map<string, ParsedReceipt[]>();
  for (const m of expectedHistoryMonths(target)) {
    // 7月分が無いときの表示を見せるため、1ヶ月だけ抜いておく
    if (m === "202607") continue;
    byMonth.set(m, parseUke(demoUke(m, target), opts).receipts);
  }
  const settings = store.getSettings();
  return finish({
    cur,
    target,
    byMonth,
    warnings: [],
    master,
    filed: settings.facilityStandards.map((s) => ({ name: s.name, filed: DEMO_FILED.includes(s.name) })),
    clinicName: "サンプル歯科医院",
    demo: true,
    previous,
  });
}

function finish(args: {
  cur: ParsedFile;
  target: string;
  byMonth: Map<string, ParsedReceipt[]>;
  warnings: string[];
  master: Map<string, MasterEntry>;
  filed: { name: string; filed: boolean }[];
  clinicName: string;
  demo: boolean;
  previous?: AuditRun;
}): AuditRun {
  const { cur, target, byMonth, warnings, master } = args;
  const expected = expectedHistoryMonths(target);
  const historyMonths: string[] = [];
  const missing: string[] = [];
  const history: ParsedReceipt[] = [];
  for (const m of expected) {
    const rec = byMonth.get(m) ?? (args.demo ? null : store.getMonthReceipts(m));
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

  const rules = store.getRules();
  const findings = runRules({
    current: cur.receipts,
    history,
    rules,
    settings: { facilityStandards: args.filed },
    master,
  });

  // 再チェック時は、同じ指摘の対応状況・メモ・AI説明を引き継ぐ
  const prev = new Map(args.previous?.findings.map((f) => [f.id, f]));
  for (const f of findings) {
    const p = prev.get(f.id);
    if (p && p.ruleId === f.ruleId && p.itemName === f.itemName) {
      f.status = p.status;
      f.memo = p.memo;
      f.aiExplanation = p.aiExplanation;
    }
  }

  const run: AuditRun = {
    id: args.previous?.id ?? (args.demo ? `demo-${target}` : `${target}-${randomUUID().slice(0, 8)}`),
    createdAt: new Date().toISOString(),
    targetMonth: target,
    clinicName: args.clinicName,
    clinicCode: cur.clinicCode,
    historyMonths,
    summary: summarize(findings, cur.receipts.length),
    findings,
    suggestions: args.previous?.suggestions ?? [],
    warnings,
    demo: args.demo,
  };
  store.saveRun(run);
  return run;
}
