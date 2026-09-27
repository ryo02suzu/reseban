import { handle } from "@/lib/api";
import { requireClinicApi } from "@/lib/auth";
import { getMasterIndex } from "@/lib/repo/core";
import { norm } from "@/lib/rules/engine";

/**
 * 紙レセプト入力の候補（公式マスターから）。
 *   ?type=act&q=初診   診療行為
 *   ?type=diag&q=Pul   傷病名（略称も）
 */
export async function GET(request: Request) {
  return handle(async () => {
    await requireClinicApi();
    const url = new URL(request.url);
    const q = norm(url.searchParams.get("q") ?? "");
    if (!q) return { items: [] };
    const master = await getMasterIndex();
    const items: { code: string; name: string; sub?: string }[] = [];
    if (url.searchParams.get("type") === "diag") {
      const exact: typeof items = [];
      for (const [code, e] of master.byomei) {
        const hit = norm(e.name).includes(q) || (e.abbr && norm(e.abbr).startsWith(q));
        if (!hit) continue;
        const row = { code, name: e.name, sub: e.abbr || undefined };
        if ((e.abbr && norm(e.abbr) === q) || norm(e.name) === q) exact.push(row);
        else items.push(row);
        if (items.length >= 30) break;
      }
      return { items: [...exact, ...items].slice(0, 20) };
    }
    const starts: typeof items = [];
    for (const e of master.shinryo.values()) {
      if (e.kasan) continue;
      const n = norm(e.name);
      const sh = norm(e.short ?? "");
      if (!n.includes(q) && !sh.includes(q)) continue;
      const row = { code: e.code, name: e.name, sub: e.points ? `${e.points}点` : undefined };
      if (n.startsWith(q) || sh.startsWith(q)) starts.push(row);
      else items.push(row);
      if (starts.length >= 20) break;
    }
    return { items: [...starts, ...items].slice(0, 20) };
  });
}
