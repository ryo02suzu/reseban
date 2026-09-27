/**
 * 最初の運営者アカウントの招待リンクを発行する。
 *   npm run create-operator -- you@example.com
 * DATABASE_URL（本番）または ./data/pglite（開発）に書き込む。
 */
import { createToken, getUserByEmail } from "../src/lib/repo/core";

async function main() {
  const email = (process.argv[2] ?? "").trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    console.error("使い方: npm run create-operator -- you@example.com");
    process.exit(1);
  }
  if (await getUserByEmail(email)) {
    console.error("このメールアドレスはすでに登録されています");
    process.exit(1);
  }
  const token = await createToken({ kind: "invite", clinicId: null, role: "operator", email, createdBy: "cli", hours: 24 });
  const base = process.env.APP_URL ?? "http://localhost:3000";
  console.log(`運営者の招待リンク（24時間有効・1回限り）:\n${base}/invite/${token}`);
  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
