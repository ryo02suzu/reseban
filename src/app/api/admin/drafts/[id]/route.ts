import { handle, HttpError, notFound, readJson } from "@/lib/api";
import { actorOf, requireApiUser } from "@/lib/auth";
import { logAction } from "@/lib/repo/core";
import { getDraft, listGlobalRules, saveDraft, upsertGlobalRule } from "@/lib/repo/rules";
import { validateRule } from "@/lib/rules/validate";

type Ctx = { params: Promise<{ id: string }> };

/** 採用（編集後のルールを渡せる。共通ルールとして全医院に配信）／却下 */
export async function PATCH(request: Request, { params }: Ctx) {
  const { id } = await params;
  return handle(async () => {
    const s = await requireApiUser(["operator"]);
    const body = await readJson<{ action?: "adopt" | "reject"; rule?: Record<string, unknown>; enabled?: boolean }>(request);
    const d = (await getDraft(id)) ?? notFound("ルール案");
    if (d.status !== "pending") throw new HttpError(400, "この案は処理済みです");
    if (body.action === "reject") {
      await saveDraft({ ...d, status: "rejected" });
      await logAction(actorOf(s), "ai.draft_reject", id);
      return { ok: true };
    }
    if (body.action !== "adopt") throw new HttpError(400, "操作が不正です");
    const rules = await listGlobalRules();
    // 採用直後は無効で配信し、テストしてから有効にできるようにする
    const rule = validateRule({ ...(body.rule ?? d.rule), id: undefined, source: "ai", priority: rules.length + 1, enabled: body.enabled === true });
    await upsertGlobalRule(rule);
    await saveDraft({ ...d, status: "adopted", rule });
    await logAction(actorOf(s), "ai.draft_adopt", id, { ruleId: rule.id, enabled: rule.enabled });
    return { rule };
  });
}
