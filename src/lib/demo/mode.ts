/**
 * デモ環境（RESEBAN_DEMO=1）。
 * DB はサーバーのメモリ上に置き、起動のたびに架空の医院・アカウント・サンプル結果を作り直す。
 * 実データの取込は受け付けない。Vercel などで画面を見てもらうためだけのモード。
 * Vercel 上で DATABASE_URL が無いときも、このモードで動く。
 *
 * サーバーレスでは画面と API が別々のインスタンスで動くことがあるため、
 * 初期データは固定の ID で作り、ログイン状態は署名付きトークンにして、どのインスタンスでも同じに見えるようにする。
 */
export const DEMO_MODE =
  process.env.RESEBAN_DEMO === "1" || (process.env.VERCEL === "1" && !process.env.DATABASE_URL);

export const DEMO_PASSWORD = "reseban-demo-2026";

export const DEMO_CLINIC_ID = "c_demo";
/** サンプルデータのチェック結果（どのインスタンスでも同じ ID にする） */
export const DEMO_RUN_ID = "202609-sample";

export const DEMO_ACCOUNTS = {
  owner: { id: "u_demo_owner", email: "demo@reseban.jp", name: "デモ院長" },
  staff: { id: "u_demo_staff", email: "staff@reseban.jp", name: "デモ受付" },
  operator: { id: "u_demo_operator", email: "operator@reseban.jp", name: "デモ運営者" },
} as const;

/** デモ環境で変えられると他の閲覧者が困る操作 */
export const DEMO_LOCKED_MESSAGE = "デモ環境ではこの操作はできません。";
