import "server-only";
import path from "node:path";
import fs from "node:fs";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";
import * as schema from "./schema";

/**
 * データベース接続。
 *   DATABASE_URL=postgres://...   本番（例：Amazon RDS for PostgreSQL 東京リージョン、保存時暗号化あり）
 *   DATABASE_URL 未設定            開発用の組み込み PostgreSQL（PGlite、./data/pglite に保存）
 *   DATABASE_URL=pglite://memory   テスト用（メモリ上）
 * 起動後、最初のアクセスでマイグレーション（drizzle/）を適用する。
 */
export type Db = NodePgDatabase<typeof schema>;

const g = globalThis as unknown as { __resebanDb?: Promise<Db> };

function migrationsFolder() {
  return path.join(/*turbopackIgnore: true*/ process.cwd(), "drizzle");
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
      ssl: process.env.DATABASE_SSL === "false" ? undefined : url.includes("localhost") ? undefined : { rejectUnauthorized: true },
    });
    const db = drizzle(pool, { schema });
    await migrate(db, { migrationsFolder: migrationsFolder() });
    return db;
  }
  const { PGlite } = await import("@electric-sql/pglite");
  const { drizzle } = await import("drizzle-orm/pglite");
  const { migrate } = await import("drizzle-orm/pglite/migrator");
  let client;
  if (url === "pglite://memory") {
    client = new PGlite();
  } else {
    const dir = path.join(process.env.RESEBAN_DATA_DIR ?? path.join(/*turbopackIgnore: true*/ process.cwd(), "data"), "pglite");
    fs.mkdirSync(dir, { recursive: true });
    client = new PGlite(dir);
  }
  const db = drizzle(client, { schema });
  await migrate(db, { migrationsFolder: migrationsFolder() });
  return db as unknown as Db;
}

export function getDb(): Promise<Db> {
  g.__resebanDb ??= connect().catch((e) => {
    g.__resebanDb = undefined;
    throw e;
  });
  return g.__resebanDb;
}

export { schema };
