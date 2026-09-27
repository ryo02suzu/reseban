import { fileBytes, handle, HttpError } from "@/lib/api";
import { actorOf, requireApiUser } from "@/lib/auth";
import { logAction, saveMaster } from "@/lib/repo/core";
import { guessKind, parseMasterFile } from "@/lib/master/parse";
import { MASTER_KINDS, type MasterKind } from "@/lib/master/types";

/** 支払基金の基本マスター（複数ファイル可。ファイル名から種類を判定、kind 指定があればそれを優先） */
export async function POST(request: Request) {
  return handle(async () => {
    const s = await requireApiUser(["operator"]);
    const form = await request.formData();
    const forced = form.get("kind");
    const results: { fileName: string; kind: MasterKind; count: number }[] = [];
    const errors: string[] = [];
    for (const v of form.getAll("files")) {
      if (typeof v === "string") continue;
      const kind = (typeof forced === "string" && MASTER_KINDS.some((k) => k.kind === forced) ? forced : guessKind(v.name)) as MasterKind | null;
      if (!kind) {
        errors.push(`${v.name}：どのマスターか判定できませんでした（ファイル名を支払基金のままにしてください）`);
        continue;
      }
      try {
        const bytes = (await fileBytes(v, 60 * 1024 * 1024))!;
        const data = parseMasterFile(kind, bytes);
        if (!data.length) throw new Error("読み取れる行がありません");
        await saveMaster(kind, v.name, data, s.user.email);
        results.push({ fileName: v.name, kind, count: data.length });
      } catch (e) {
        errors.push(`${v.name}：${e instanceof Error ? e.message : String(e)}`);
      }
    }
    if (!results.length && !errors.length) throw new HttpError(400, "ファイルを選んでください");
    await logAction(actorOf(s), "master.import", "", { results, errors });
    return { results, errors };
  });
}
