import { handle, readJson } from "@/lib/api";
import { actorOf, requireClinicApi } from "@/lib/auth";
import { logAction } from "@/lib/repo/core";
import { listClinicRules, upsertClinicRule } from "@/lib/repo/rules";
import { validateRule } from "@/lib/rules/validate";

export async function GET() {
  return handle(async () => {
    const s = await requireClinicApi();
    return listClinicRules(s.clinic.id);
  });
}

/** 医院独自のルールを追加（院長・管理者のみ） */
export async function POST(request: Request) {
  return handle(async () => {
    const s = await requireClinicApi(["owner"]);
    const body = await readJson(request);
    const current = await listClinicRules(s.clinic.id);
    const rule = validateRule({ ...body, source: "manual", id: undefined, priority: current.length + 1 });
    await upsertClinicRule(s.clinic.id, rule);
    await logAction(actorOf(s), "rule.create", rule.id, { name: rule.name });
    return { rule: { ...rule, origin: "clinic" } };
  });
}
