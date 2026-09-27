import { handle, notFound, readJson } from "@/lib/api";
import { actorOf, requireClinicApi } from "@/lib/auth";
import { logAction } from "@/lib/repo/core";
import { deleteClinicRule, listClinicRules, setClinicRuleEnabled, upsertClinicRule } from "@/lib/repo/rules";
import { validateRule } from "@/lib/rules/validate";

type Ctx = { params: Promise<{ id: string }> };

/** { enabled } だけなら有効・無効の切り替え（共通ルールも可）、それ以外は医院独自ルールの編集 */
export async function PATCH(request: Request, { params }: Ctx) {
  const { id } = await params;
  return handle(async () => {
    const s = await requireClinicApi(["owner"]);
    const body = await readJson(request);
    const current = (await listClinicRules(s.clinic.id)).find((r) => r.id === id) ?? notFound("ルール");
    const keys = Object.keys(body);
    if (keys.length === 1 && keys[0] === "enabled") {
      await setClinicRuleEnabled(s.clinic.id, id, body.enabled === true);
      await logAction(actorOf(s), "rule.toggle", id, { enabled: body.enabled === true });
    } else {
      const rule = validateRule({ ...body, id, source: current.source, priority: current.priority, historyCount: current.historyCount });
      await upsertClinicRule(s.clinic.id, rule);
      await logAction(actorOf(s), "rule.update", id);
    }
    return { rule: (await listClinicRules(s.clinic.id)).find((r) => r.id === id) };
  });
}

export async function DELETE(_: Request, { params }: Ctx) {
  const { id } = await params;
  return handle(async () => {
    const s = await requireClinicApi(["owner"]);
    await deleteClinicRule(s.clinic.id, id);
    await logAction(actorOf(s), "rule.delete", id);
  });
}
