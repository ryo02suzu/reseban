import { RulesClient } from "@/components/RulesClient";
import { requireClinicPage } from "@/lib/auth";
import { getClaimHistory, listClinicRules } from "@/lib/repo/rules";
import { buildRanking } from "@/lib/rules/ranking";
import { facilityOptions } from "@/lib/rules/facility";

export default async function RulesPage() {
  const s = await requireClinicPage();
  const [rules, history] = await Promise.all([listClinicRules(s.clinic.id), getClaimHistory(s.clinic.id)]);
  return (
    <RulesClient
      mode="clinic"
      canEdit={s.user.role === "owner"}
      initialRules={rules}
      initialRanking={buildRanking(history, rules)}
      initialDrafts={[]}
      facilities={facilityOptions()}
      aiReady={false}
    />
  );
}
