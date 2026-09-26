import FACILITY_NAMES from "../master/facility-codes.json";

/** レセ電「届出」欄のコード（別表5）→ 施設基準コード（別紙7-8） */
export const TODOKEDE_TO_FACILITY: Record<string, string[]> = {
  "01": ["1305"], // 補管 → クラウン・ブリッジ維持管理料
  "17": ["1351"], // 歯初診 → 初診料(歯科)の注1に掲げる基準
};

/** 設定画面に出す施設基準（歯科で使われるもの。13xx を先頭に） */
export function facilityOptions(): { code: string; name: string }[] {
  return Object.entries(FACILITY_NAMES as Record<string, string>)
    .map(([code, name]) => ({ code, name }))
    .sort((a, b) => Number(!a.code.startsWith("13")) - Number(!b.code.startsWith("13")) || a.code.localeCompare(b.code));
}

export function facilityNameOf(code: string): string {
  return (FACILITY_NAMES as Record<string, string>)[code] ?? `施設基準コード${code}`;
}
