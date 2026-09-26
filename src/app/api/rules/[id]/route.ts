import { getRules, saveRules } from "@/lib/store";
import { handle, notFound } from "@/lib/api";
import { validateRule } from "@/lib/rules/validate";

type Ctx = { params: Promise<{ id: string }> };

/** { enabled } だけなら有効・無効の切り替え、それ以外はルール全体の更新 */
export async function PATCH(request: Request, { params }: Ctx) {
  const { id } = await params;
  const body = (await request.json()) as Record<string, unknown>;
  return handle(() => {
    const rules = getRules();
    const i = rules.findIndex((r) => r.id === id);
    if (i < 0) notFound("ルール");
    const cur = rules[i];
    const keys = Object.keys(body);
    const next =
      keys.length === 1 && keys[0] === "enabled"
        ? { ...cur, enabled: body.enabled === true }
        : validateRule({ ...body, id: cur.id, source: cur.source, priority: cur.priority, historyCount: cur.historyCount });
    rules[i] = next;
    saveRules(rules);
    return { rule: next };
  });
}

export async function DELETE(_: Request, { params }: Ctx) {
  const { id } = await params;
  return handle(() => {
    const rules = getRules();
    const rule = rules.find((r) => r.id === id) ?? notFound("ルール");
    if (rule.source === "builtin") throw new Error("初期ルールは削除できません。無効にしてください。");
    saveRules(rules.filter((r) => r.id !== id).map((r, i) => ({ ...r, priority: i + 1 })));
  });
}
