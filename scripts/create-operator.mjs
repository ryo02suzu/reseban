/**
 * 最初の運営者アカウントの招待リンクを発行する（本番コンテナでも動く素の JS 版）。
 *   node scripts/create-operator.mjs you@example.com
 * DATABASE_URL があれば PostgreSQL、無ければ開発用の ./data/pglite に書き込む。
 * テーブルが無ければマイグレーション（drizzle/）を先に適用する。
 * 開発用 PGlite は1プロセスしか開けないため、npm run dev を止めてから実行すること。
 */
import { createHash, randomBytes } from "node:crypto";
import path from "node:path";

const email = (process.argv[2] ?? "").trim().toLowerCase();
if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
  console.error("使い方: node scripts/create-operator.mjs you@example.com");
  process.exit(1);
}

const url = process.env.DATABASE_URL ?? "";
const migrationsFolder = path.join(process.cwd(), "drizzle");
let query;
let close = async () => {};
if (url.startsWith("postgres")) {
  const { default: pg } = await import("pg");
  const { drizzle } = await import("drizzle-orm/node-postgres");
  const { migrate } = await import("drizzle-orm/node-postgres/migrator");
  const client = new pg.Client({
    connectionString: url,
    ssl:
      process.env.DATABASE_SSL === "false" || url.includes("localhost")
        ? undefined
        : { rejectUnauthorized: true, ca: process.env.DATABASE_CA_CERT?.replace(/\\n/g, "\n") || undefined },
  });
  await client.connect();
  close = () => client.end();
  await migrate(drizzle(client), { migrationsFolder });
  query = (sql, params) => client.query(sql, params);
} else {
  const fs = await import("node:fs");
  const { PGlite } = await import("@electric-sql/pglite");
  const { drizzle } = await import("drizzle-orm/pglite");
  const { migrate } = await import("drizzle-orm/pglite/migrator");
  const dir = path.join(process.env.RESEBAN_DATA_DIR ?? path.join(process.cwd(), "data"), "pglite");
  fs.mkdirSync(dir, { recursive: true });
  const client = new PGlite(dir);
  close = () => client.close();
  await migrate(drizzle(client), { migrationsFolder });
  query = (sql, params) => client.query(sql, params);
}

try {
  const exists = await query("select 1 from users where email = $1", [email]);
  if (exists.rows.length) {
    console.error("このメールアドレスはすでに登録されています");
    process.exit(1);
  }
  const token = randomBytes(32).toString("base64url");
  await query(
    "insert into tokens (id, kind, role, email, expires_at, created_by) values ($1, 'invite', 'operator', $2, now() + interval '24 hours', 'cli')",
    [createHash("sha256").update(token).digest("hex"), email],
  );
  const base = process.env.APP_URL ?? "http://localhost:3000";
  console.log(`運営者の招待リンク（24時間有効・1回限り）:\n${base}/invite/${token}`);
} finally {
  await close();
}
