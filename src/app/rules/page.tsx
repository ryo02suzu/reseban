import { connection } from "next/server";
import { RulesClient } from "@/components/RulesClient";
import { getClaimHistory, getDrafts, getRules, getSettings } from "@/lib/store";
import { buildRanking } from "@/lib/rules/ranking";
import { getAiConfig } from "@/lib/ai/client";

export default async function RulesPage() {
  await connection();
  const rules = getRules();
  const settings = getSettings();
  return (
    <RulesClient
      initialRules={rules}
      initialRanking={buildRanking(getClaimHistory(), rules)}
      initialDrafts={getDrafts().filter((d) => d.status === "pending")}
      standards={settings.facilityStandards.map((s) => s.name)}
      aiReady={settings.aiEnabled && getAiConfig().provider !== null}
    />
  );
}
