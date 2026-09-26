import { getRules, saveRules } from "@/lib/store";
import { handle } from "@/lib/api";
import { validateRule } from "@/lib/rules/validate";

export async function GET() {
  return handle(() => getRules());
}

/** 手動でルールを追加 */
export async function POST(request: Request) {
  const body = await request.json();
  return handle(() => {
    const rules = getRules();
    const rule = validateRule({ ...body, source: "manual", id: undefined, priority: rules.length + 1 });
    saveRules([...rules, rule]);
    return { rule };
  });
}
