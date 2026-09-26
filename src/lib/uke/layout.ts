/**
 * レセ電（歯科）のレコード列位置。
 *
 * 【要確認】列位置は「オンライン又は光ディスク等による請求に係る記録条件仕様（歯科用）」
 * の令和8年6月版で必ず照合すること。仕様が変わったらここだけ直せばよいように、
 * パーサー本体には列番号を書かない。番号は 0 始まり（先頭のレコード識別が 0）。
 */
export const LAYOUT = {
  IR: {
    /** 点数表（3 = 歯科） */
    tensuHyo: 3,
    clinicCode: 4,
    clinicName: 6,
    /** 請求年月（和暦 GYYMM） */
    billingMonth: 7,
  },
  RE: {
    receiptNo: 1,
    receiptType: 2,
    /** 診療年月（和暦 GYYMM） */
    month: 3,
    /** 氏名（読み取ったら即破棄） */
    name: 4,
    sex: 5,
    /** 生年月日（患者キーの計算にだけ使い、保存しない） */
    birth: 6,
    karteNo: 13,
  },
  HO: {
    insurerNo: 1,
    /** 記号・番号（患者キーの計算にだけ使い、保存しない） */
    kigo: 2,
    bango: 3,
    days: 4,
    totalPoints: 5,
  },
  /** 傷病名部位 */
  HS: {
    startDate: 1,
    outcome: 2,
    code: 3,
    modifier: 4,
    name: 5,
    main: 6,
    /** 歯式（"/" 区切りで複数） */
    teeth: 8,
  },
  /** 歯科診療行為 */
  SS: {
    shinryoShikibetsu: 1,
    code: 3,
    points: 5,
    count: 6,
    /** 末尾 31 列が 1日〜31日の算定回数 */
    dayColumns: 31,
  },
  /** 医薬品・特定器材も SS と同様に扱う（点数計算のみ） */
  IY: { code: 3, points: 5, count: 6, dayColumns: 31 },
  TO: { code: 3, points: 5, count: 6, dayColumns: 31 },
  /** コメント */
  CO: {
    code: 3,
    text: 4,
  },
} as const;

/** 患者を特定できるため読み捨てるレコード */
export const DROP_RECORDS = new Set(["SN", "KO", "JD", "MF"]);
