/**
 * デモ環境（RESEBAN_DEMO=1）。
 * DB はサーバーのメモリ上に置き、起動のたびに架空の医院とアカウントを作り直す。
 * 実データの取込は受け付けない。Vercel などで画面を見てもらうためだけのモード。
 */
export const DEMO_MODE = process.env.RESEBAN_DEMO === "1";

export const DEMO_ACCOUNTS = {
  owner: { email: "demo@reseban.jp", password: "reseban-demo-2026", name: "デモ院長" },
  staff: { email: "staff@reseban.jp", password: "reseban-demo-2026", name: "デモ受付" },
  operator: { email: "operator@reseban.jp", password: "reseban-demo-2026", name: "デモ運営者" },
} as const;
