import { handle, readJson } from "@/lib/api";
import { actorOf, requireApiUser } from "@/lib/auth";
import { logAction } from "@/lib/repo/core";
import { listGlobalRules, upsertGlobalRule } from "@/lib/repo/rules";
import { validateRule } from "@/lib/rules/validate";

export async function GET() {
  return handle(async () => {
    await requireApiUser(["operator"]);
    return listGlobalRules();
  });
}

export async function POST(request: Request) {
  return handle(async () => {
    const s = await requireApiUser(["operator"]);
    const body = await readJson(request);
    const current = await listGlobalRules();
    const rule = validateRule({ ...body, source: "manual", id: undefined, priority: current.length + 1 });
    await upsertGlobalRule(rule);
    await logAction(actorOf(s), "global_rule.create", rule.id, { name: rule.name });
    return { rule };
  });
}
