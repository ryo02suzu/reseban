import { connection } from "next/server";
import { SettingsClient } from "@/components/SettingsClient";
import { getMasterStatuses, getSettings } from "@/lib/store";
import { getAiConfig } from "@/lib/ai/client";

export default async function SettingsPage() {
  await connection();
  const ai = getAiConfig();
  return (
    <SettingsClient
      initialSettings={getSettings()}
      masters={getMasterStatuses()}
      ai={{ provider: ai.provider, region: ai.region, model: ai.model, domestic: ai.domestic }}
    />
  );
}
