import "server-only";
import path from "node:path";
import fs from "node:fs";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";
import * as schema from "./schema";
import { DEMO_MODE } from "../demo/mode";

/**
 * データベース接続。
 *   DATABASE_URL=postgres://...   本番（例：Amazon RDS for PostgreSQL 東京リージョン、保存時暗号化あり）
 *   DATABASE_URL 未設定            開発用の組み込み PostgreSQL（PGlite、./data/pglite に保存）
 *   DATABASE_URL=pglite://memory   テスト用（メモリ上）
 *   RESEBAN_DEMO=1                 デモ用（メモリ上、起動のたびに架空の医院を作り直す。src/lib/demo/mode.ts）
 * 起動後、最初のアクセスでマイグレーション（drizzle/）を適用する。
 */
export type Db = NodePgDatabase<typeof schema>;

const g = globalThis as unknown as { __resebanDb?: Promise<Db>; __resebanRaw?: Promise<Db>; __resebanSeeding?: boolean };

function migrationsFolder() {
  return path.join(/*turbopackIgnore: true*/ process.cwd(), "drizzle");
}

/** DB 接続の TLS。証明書は必ず検証する（独自CAの DB は DATABASE_CA_CERT に PEM を入れる） */
function sslOption(url: string) {
  if (process.env.DATABASE_SSL === "false" || url.includes("localhost")) return undefined;
  const ca = process.env.DATABASE_CA_CERT?.replace(/\\n/g, "\n");
  return ca ? { rejectUnauthorized: true, ca } : { rejectUnauthorized: true };
}

async function connect(): Promise<Db> {
  const url = process.env.DATABASE_URL ?? "";
  if (url.startsWith("postgres")) {
    const { Pool } = await import("pg");
    const { drizzle } = await import("drizzle-orm/node-postgres");
    const { migrate } = await import("drizzle-orm/node-postgres/migrator");
    const pool = new Pool({
      connectionString: url,
      max: Number(process.env.DATABASE_POOL_MAX ?? 10),
      ssl: sslOption(url),
    });
    const db = drizzle(pool, { schema });
    await migrate(db, { migrationsFolder: migrationsFolder() });
    return db;
  }
  const { PGlite } = await import("@electric-sql/pglite");
  const { drizzle } = await import("drizzle-orm/pglite");
  const { migrate } = await import("drizzle-orm/pglite/migrator");
  let client;
  if (url === "pglite://memory" || DEMO_MODE) {
    client = new PGlite();
  } else {
    const dir = path.join(process.env.RESEBAN_DATA_DIR ?? path.join(/*turbopackIgnore: true*/ process.cwd(), "data"), "pglite");
    fs.mkdirSync(dir, { recursive: true });
    client = new PGlite(dir);
  }
  const db = drizzle(client, { schema });
  await migrate(db, { migrationsFolder: migrationsFolder() });
  if (DEMO_MODE) {
    const { seedDemo } = await import("./demo-seed");
    const { TERMS_VERSION } = await import("../terms");
    await seedDemo(db as unknown as Db, TERMS_VERSION);
  }
  return db as unknown as Db;
}

async function init(): Promise<Db> {
  g.__resebanRaw = connect();
  const db = await g.__resebanRaw;
  if (DEMO_MODE) {
    // デモの初期データはリポジトリ関数で作るため、その間だけ getDb() は接続そのものを返す
    g.__resebanSeeding = true;
    try {
      const { seedDemoData } = await import("./demo-seed");
      await seedDemoData();
    } finally {
      g.__resebanSeeding = false;
    }
  }
  return db;
}

export function getDb(): Promise<Db> {
  if (g.__resebanSeeding && g.__resebanRaw) return g.__resebanRaw;
  g.__resebanDb ??= init().catch((e) => {
    g.__resebanDb = undefined;
    throw e;
  });
  return g.__resebanDb;
}

export { schema };
