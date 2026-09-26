import { getSettings, saveSettings } from "@/lib/store";
import { handle } from "@/lib/api";
import type { Settings } from "@/lib/types";

export async function PUT(request: Request) {
  const body = (await request.json()) as Partial<Settings>;
  return handle(() => {
    const cur = getSettings();
    const next: Settings = {
      clinicName: typeof body.clinicName === "string" ? body.clinicName.slice(0, 100) : cur.clinicName,
      clinicCode: cur.clinicCode,
      aiEnabled: typeof body.aiEnabled === "boolean" ? body.aiEnabled : cur.aiEnabled,
      facilityStandards: Array.isArray(body.facilityStandards)
        ? body.facilityStandards
            .filter((s) => s && typeof s.name === "string" && s.name.trim())
            .map((s) => ({ name: s.name.trim().slice(0, 60), filed: s.filed === true }))
        : cur.facilityStandards,
    };
    saveSettings(next);
    return next;
  });
}
