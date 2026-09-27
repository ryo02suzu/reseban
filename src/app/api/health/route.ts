import { sql } from "drizzle-orm";
import { getDb } from "@/lib/db";

/** ロードバランサー用の死活確認（DB に繋がるか） */
export async function GET() {
  try {
    const db = await getDb();
    await db.execute(sql`select 1`);
    return Response.json({ ok: true });
  } catch {
    return Response.json({ ok: false }, { status: 503 });
  }
}
