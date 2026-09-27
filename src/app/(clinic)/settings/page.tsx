import { SettingsClient } from "@/components/SettingsClient";
import { requireClinicPage } from "@/lib/auth";
import { getAiConfig } from "@/lib/ai/client";
import { facilityOptions } from "@/lib/rules/facility";

export default async function SettingsPage() {
  const s = await requireClinicPage();
  const ai = getAiConfig();
  return (
    <SettingsClient
      canEdit={s.user.role === "owner"}
      myTotp={s.user.totpEnabled}
      clinic={{
        name: s.clinic.name,
        code: s.clinic.code,
        facilityCodes: s.clinic.facilityCodes,
        aiEnabled: s.clinic.aiEnabled,
        require2fa: s.clinic.require2fa,
        retentionMonths: s.clinic.retentionMonths,
        aiMonthlyLimit: s.clinic.aiMonthlyLimit,
      }}
      facilities={facilityOptions()}
      ai={{ provider: ai.provider, region: ai.region, domestic: ai.domestic }}
    />
  );
}
