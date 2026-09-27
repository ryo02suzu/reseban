import { RulesClient } from "@/components/RulesClient";
import { requirePageUser } from "@/lib/auth";
import { listDrafts, listGlobalRules } from "@/lib/repo/rules";
import { facilityOptions } from "@/lib/rules/facility";
import { getAiConfig } from "@/lib/ai/client";

export default async function AdminRulesPage() {
  await requirePageUser(["operator"]);
  const [rules, drafts] = await Promise.all([listGlobalRules(), listDrafts()]);
  return (
    <RulesClient
      mode="admin"
      canEdit
      initialRules={rules}
      initialRanking={[]}
      initialDrafts={drafts}
      facilities={facilityOptions()}
      aiReady={getAiConfig().provider !== null}
    />
  );
}
