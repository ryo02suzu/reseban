import { getDrafts, getRules, saveDrafts, saveRules } from "@/lib/store";
import { handle, notFound } from "@/lib/api";
import { validateRule } from "@/lib/rules/validate";

type Ctx = { params: Promise<{ id: string }> };

/** 採用（編集後のルールを渡せる）／却下 */
export async function PATCH(request: Request, { params }: Ctx) {
  const { id } = await params;
  const body = (await request.json()) as { action: "adopt" | "reject"; rule?: unknown };
  return handle(() => {
    const drafts = getDrafts();
    const d = drafts.find((x) => x.id === id) ?? notFound("ルール案");
    if (d.status !== "pending") throw new Error("この案は処理済みです");
    if (body.action === "reject") {
      d.status = "rejected";
      saveDrafts(drafts);
      return { draft: d };
    }
    const rules = getRules();
    const rule = validateRule({ ...(body.rule ?? d.rule), id: undefined, source: "ai", priority: rules.length + 1 });
    saveRules([...rules, rule]);
    d.status = "adopted";
    d.rule = rule;
    saveDrafts(drafts);
    return { draft: d, rule };
  });
}
