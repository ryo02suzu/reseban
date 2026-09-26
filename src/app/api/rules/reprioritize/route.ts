import { getClaimHistory, getRules, saveRules } from "@/lib/store";
import { handle } from "@/lib/api";
import { reprioritize } from "@/lib/rules/ranking";

export async function POST() {
  return handle(() => {
    const rows = getClaimHistory();
    if (!rows.length) throw new Error("先に実績CSVを取り込んでください");
    const rules = reprioritize(getRules(), rows);
    saveRules(rules);
    return { rules };
  });
}
