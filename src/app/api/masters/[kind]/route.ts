import { saveMaster } from "@/lib/store";
import { fileBytes, handle } from "@/lib/api";
import { parseMaster } from "@/lib/master/parse";
import type { MasterKind } from "@/lib/types";

type Ctx = { params: Promise<{ kind: string }> };

const KINDS: MasterKind[] = ["shinryo", "byomei", "shishiki", "comment"];

export async function POST(request: Request, { params }: Ctx) {
  const { kind } = await params;
  return handle(async () => {
    if (!KINDS.includes(kind as MasterKind)) throw new Error("マスターの種類が不正です");
    const form = await request.formData();
    const file = form.get("file");
    const bytes = await fileBytes(file);
    if (!bytes || typeof file === "string" || !file) throw new Error("ファイルを選んでください");
    const entries = parseMaster(bytes, kind as MasterKind);
    if (!entries.length) throw new Error("読み取れる行がありませんでした。支払基金のマスター（CSV）か確認してください。");
    saveMaster(kind as MasterKind, entries, file.name);
    return { count: entries.length, sample: entries.slice(0, 3), importedAt: new Date().toISOString(), fileName: file.name };
  });
}
