import { handle, notFound, readJson } from "@/lib/api";
import { actorOf, requireApiUser } from "@/lib/auth";
import { logAction } from "@/lib/repo/core";
import { deleteGlobalRule, listGlobalRules, upsertGlobalRule } from "@/lib/repo/rules";
import { validateRule } from "@/lib/rules/validate";

type Ctx = { params: Promise<{ id: string }> };

export async function PATCH(request: Request, { params }: Ctx) {
  const { id } = await params;
  return handle(async () => {
    const s = await requireApiUser(["operator"]);
    const body = await readJson(request);
    const cur = (await listGlobalRules()).find((r) => r.id === id) ?? notFound("ルール");
    const keys = Object.keys(body);
    const rule =
      (keys.length === 1 && keys[0] === "enabled") || cur.kind === "official"
        ? { ...cur, enabled: body.enabled === true }
        : validateRule({ ...body, id, source: cur.source, priority: cur.priority });
    await upsertGlobalRule(rule);
    await logAction(actorOf(s), "global_rule.update", id, { enabled: rule.enabled });
    return { rule };
  });
}

export async function DELETE(_: Request, { params }: Ctx) {
  const { id } = await params;
  return handle(async () => {
    const s = await requireApiUser(["operator"]);
    await deleteGlobalRule(id);
    await logAction(actorOf(s), "global_rule.delete", id);
  });
}
