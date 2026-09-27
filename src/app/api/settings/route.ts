import { handle, HttpError, readJson } from "@/lib/api";
import { actorOf, requireClinicApi } from "@/lib/auth";
import { logAction, updateClinic } from "@/lib/repo/core";
import { facilityOptions } from "@/lib/rules/facility";

const KNOWN = new Set(facilityOptions().map((f) => f.code));

export async function PUT(request: Request) {
  return handle(async () => {
    const s = await requireClinicApi(["owner"]);
    const b = await readJson<{ name?: string; facilityCodes?: string[]; aiEnabled?: boolean; require2fa?: boolean; retentionMonths?: number }>(request);
    const patch: Parameters<typeof updateClinic>[1] = {};
    if (typeof b.name === "string") {
      if (!b.name.trim()) throw new HttpError(400, "医院名を入力してください");
      patch.name = b.name.trim().slice(0, 100);
    }
    if (Array.isArray(b.facilityCodes)) {
      const codes = [...new Set(b.facilityCodes.filter((c) => typeof c === "string" && KNOWN.has(c)))].sort();
      patch.facilityCodes = codes;
    }
    if (typeof b.aiEnabled === "boolean") patch.aiEnabled = b.aiEnabled;
    if (typeof b.require2fa === "boolean") {
      if (b.require2fa && !s.user.totpEnabled) throw new HttpError(400, "先にご自身の2段階認証を設定してください（アカウント画面）");
      patch.require2fa = b.require2fa;
    }
    if (b.retentionMonths !== undefined) {
      const m = Number(b.retentionMonths);
      if (!Number.isInteger(m) || m < 7 || m > 60) throw new HttpError(400, "保存期間は7〜60ヶ月で指定してください（過去6ヶ月分の点検に7ヶ月以上必要です）");
      patch.retentionMonths = m;
    }
    const clinic = await updateClinic(s.clinic.id, patch);
    await logAction(actorOf(s), "settings.update", "", { fields: Object.keys(patch) });
    return clinic;
  });
}
