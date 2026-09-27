import { MastersClient } from "@/components/MastersClient";
import { requirePageUser } from "@/lib/auth";
import { masterStatuses } from "@/lib/repo/core";
import { getAiConfig } from "@/lib/ai/client";

export default async function AdminMastersPage() {
  await requirePageUser(["operator"]);
  const ai = getAiConfig();
  return <MastersClient statuses={await masterStatuses()} ai={{ provider: ai.provider, region: ai.region, model: ai.model, domestic: ai.domestic }} />;
}
