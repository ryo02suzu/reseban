// UI 確認用のサンプルデータ（機能実装までの仮置き）
import type { AuditRun, AuditRunListItem, MasterStatus, Settings } from "./types";
import type { RankingRow, Rule, RuleDraft } from "./rules/types";

export const mockRun: AuditRun = {
  id: "demo-202609",
  createdAt: "2026-09-26T10:00:00+09:00",
  targetMonth: "202609",
  clinicName: "サンプル歯科医院",
  clinicCode: "1234567",
  historyMonths: ["202603", "202604", "202605", "202606", "202607", "202608"],
  demo: true,
  warnings: [],
  summary: {
    receiptCount: 412,
    henreiCount: 3,
    sateiYen: 18400,
    moreYen: 26700,
    byCategory: {
      frequency: 2,
      exclusive: 1,
      prerequisite: 1,
      diagnosis: 1,
      comment: 1,
      facility: 1,
    },
  },
  findings: [
    {
      id: "f1",
      ruleId: "r-prereq-srp",
      ruleName: "SRPの前に歯周基本検査",
      category: "prerequisite",
      impact: "satei",
      karteNo: "00123",
      receiptNo: "15",
      month: "202609",
      date: "2026-09-04",
      tooth: "右下6,7",
      itemName: "スケーリング・ルート・プレーニング",
      points: 120,
      amountYen: 1200,
      reason: "過去6ヶ月に歯周基本検査・精密検査の算定がありません。",
      basis: "歯周病の治療は歯周病検査の結果に基づいて行う（歯周病の診断と治療に関する指針）",
      fix: "検査を実施していればカルテを確認し検査を追加算定。未実施ならSRPを外す。",
      status: "open",
    },
    {
      id: "f2",
      ruleId: "r-freq-shikan",
      ruleName: "歯科疾患管理料は月1回",
      category: "frequency",
      impact: "satei",
      karteNo: "00456",
      receiptNo: "88",
      month: "202609",
      itemName: "歯科疾患管理料",
      points: 100,
      amountYen: 1000,
      reason: "同月に2回算定されています（9/2, 9/16）。",
      basis: "歯科疾患管理料は月1回に限り算定する。",
      fix: "2回目（9/16）を削除。",
      status: "open",
    },
    {
      id: "f3",
      ruleId: "r-comment-houmon",
      ruleName: "訪問診療の実施時刻コメント",
      category: "comment",
      impact: "henrei",
      karteNo: "00789",
      receiptNo: "201",
      month: "202609",
      date: "2026-09-11",
      itemName: "歯科訪問診療1",
      points: 1100,
      amountYen: 11000,
      reason: "実施時刻（開始・終了）のコメントがありません。",
      basis: "歯科訪問診療料は、診療の開始・終了時刻をレセプトに記載する。",
      fix: "実施時刻コメントを追加。",
      status: "open",
    },
    {
      id: "f4",
      ruleId: "r-fac-anzen",
      ruleName: "外安全の届出あり → 初診時に加算",
      category: "facility",
      impact: "more",
      karteNo: "00321",
      receiptNo: "42",
      month: "202609",
      date: "2026-09-09",
      itemName: "歯科外来診療医療安全対策加算1",
      points: 12,
      amountYen: 120,
      reason: "届出済みですが、初診料に加算が付いていません。",
      basis: "施設基準に適合し届出た医療機関は初診時に加算できる。",
      fix: "初診料に加算を追加。",
      status: "open",
    },
  ],
  suggestions: [],
};

export const mockRuns: AuditRunListItem[] = [
  {
    ...mockRun,
  },
];

export const mockSettings: Settings = {
  clinicName: "サンプル歯科医院",
  clinicCode: "1234567",
  aiEnabled: true,
  facilityStandards: [
    { name: "歯科外来診療医療安全対策加算1", filed: true },
    { name: "歯科外来診療感染対策加算1", filed: true },
    { name: "口腔管理体制強化加算", filed: false },
    { name: "CAD/CAM冠及びCAD/CAMインレー", filed: true },
  ],
};

export const mockMasters: MasterStatus[] = [
  { kind: "shinryo", count: 0 },
  { kind: "byomei", count: 0 },
  { kind: "shishiki", count: 0 },
  { kind: "comment", count: 0 },
];

export const mockRules: Rule[] = [
  {
    id: "r-prereq-srp",
    kind: "prerequisite",
    name: "SRPの前に歯周基本検査",
    category: "prerequisite",
    impact: "satei",
    enabled: true,
    priority: 1,
    basis: "歯周病検査の結果に基づき治療計画を立てる",
    fix: "検査の算定を確認",
    source: "builtin",
    historyCount: 14,
    target: { names: ["スケーリング・ルート・プレーニング"] },
    required: { names: ["歯周基本検査", "歯周精密検査"] },
    lookbackMonths: 6,
  },
];

export const mockRanking: RankingRow[] = [
  { label: "スケーリング・ルート・プレーニング", count: 14, points: 1680, ruleId: "r-prereq-srp" },
  { label: "歯科疾患管理料", count: 9, points: 900 },
];

export const mockDrafts: RuleDraft[] = [];
