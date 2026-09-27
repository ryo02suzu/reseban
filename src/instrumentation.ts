/** サーバー起動時：保存期間を過ぎたデータの削除を1日1回動かす */
export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs" || process.env.RESEBAN_DISABLE_JOBS === "1") return;
  const { DEMO_MODE } = await import("./lib/demo/mode");
  if (DEMO_MODE) return;
  const { runRetention } = await import("./lib/jobs");
  const tick = () => runRetention().catch((e) => console.error("[retention]", e));
  setTimeout(tick, 60_000);
  setInterval(tick, 24 * 3600_000).unref();
}
