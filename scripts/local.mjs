/**
 * 院内のパソコンだけで動かす（インターネットには公開しない）。
 *   npm run local
 * - このパソコンのブラウザからだけ開ける（http://127.0.0.1:3000）
 * - データは ./data に保存（暗号化キー ./data/dev-encryption-key も。フォルダごとバックアップすること）
 * - 初回は `npm run local -- メールアドレス` で、最初の管理者（運営者）の招待リンクを表示する
 */
import { spawn, spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
process.chdir(root);
const port = process.env.PORT ?? "3000";
const env = {
  ...process.env,
  NODE_ENV: "production",
  // ./data に鍵ファイルを作って使う（このパソコンの中だけで完結させるため）
  RESEBAN_ALLOW_DEV_KEY: "1",
  // 127.0.0.1 だけで待ち受けるので HTTPS なしで使う
  INSECURE_COOKIES: "1",
  APP_URL: `http://127.0.0.1:${port}`,
};
delete env.DATABASE_URL;

const bin = (name) => path.join(root, "node_modules", ".bin", process.platform === "win32" ? `${name}.cmd` : name);

if (!fs.existsSync(path.join(root, ".next", "BUILD_ID"))) {
  console.log("初回の準備をしています（数分かかります）…");
  const r = spawnSync(bin("next"), ["build"], { stdio: "inherit", env: { ...env, NEXT_OUTPUT: "" }, shell: process.platform === "win32" });
  if (r.status !== 0) process.exit(r.status ?? 1);
}

// まだ誰も登録していなければ、運営者（最初の管理者）の招待リンクを出す
const dbDir = path.join(process.env.RESEBAN_DATA_DIR ?? path.join(root, "data"), "pglite");
if (!fs.existsSync(dbDir) && process.argv[2]) {
  spawnSync(process.execPath, ["scripts/create-operator.mjs", process.argv[2]], { stdio: "inherit", env });
}

console.log(`\nレセ番を起動します：http://127.0.0.1:${port}\n（このパソコンからだけ開けます。止めるときは Ctrl+C）\n`);
const child = spawn(bin("next"), ["start", "-H", "127.0.0.1", "-p", port], { stdio: "inherit", env, shell: process.platform === "win32" });
child.on("exit", (code) => process.exit(code ?? 0));
