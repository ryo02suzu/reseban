/**
 * レセ電（歯科）のレコード列位置。
 *
 * 出典：「オンライン又は光ディスク等による請求に係る記録条件仕様（歯科用）令和８年６月版」
 *       https://shinryohoshu.mhlw.go.jp/shinryohoshu/file/spec/R08bt1_3_kiroku_dental.pdf
 * 番号は 0 始まり（先頭のレコード識別情報が 0）。仕様が改定されたらここだけ直す。
 */
export const LAYOUT = {
  /** 受付情報（ファイル先頭） */
  UK: {
    /** 審査支払機関（1：支払基金、2：国保連合会） */
    payer: 1,
    tensuHyo: 3,
    clinicCode: 4,
    clinicName: 6,
    billingMonth: 7,
    /** 施設基準届出コード（2桁ずつ連結） */
    todokede: 8,
    /** マルチボリューム識別情報（00, 01, …, 99） */
    volume: 9,
  },
  /** 医療機関情報（レセプトごとの先頭） */
  IR: {
    payer: 1,
    tensuHyo: 3,
    clinicCode: 4,
    billingMonth: 6,
    todokede: 8,
  },
  /**
   * レセプト共通。
   * 氏名(4)・カタカナ氏名(25)・請求情報２(21) は患者を特定できるため読まない。
   * 生年月日(6) は年齢と患者キーの計算にだけ使い、保存しない。
   */
  RE: {
    receiptNo: 1,
    receiptType: 2,
    month: 3,
    sex: 5,
    birth: 6,
    karteNo: 15,
    patientStates: 26,
  },
  /** 保険者。記号・番号は患者キーの計算にだけ使い、保存しない */
  HO: {
    insurerNo: 1,
    kigo: 2,
    bango: 3,
    days: 4,
    totalPoints: 5,
  },
  /** 傷病名部位 */
  HS: {
    startDate: 1,
    outcome: 2,
    /** 歯式コード（6桁ずつ連結、区切りなし） */
    teeth: 3,
    code: 4,
    /** 修飾語コード（4桁ずつ連結） */
    modifiers: 5,
    /** 未コード化傷病名（0000999）のときだけ記録される名称 */
    name: 6,
    /** 併存傷病名数（後続のHSが同じ歯式を共有する） */
    coexist: 7,
    transition: 8,
    main: 9,
    commentCode: 10,
    commentText: 11,
    commentTeeth: 12,
  },
  /** 歯科診療行為：加算コード・数量の組が35個、その後に点数・回数・1〜31日 */
  SS: {
    code: 3,
    qty1: 4,
    qty2: 5,
    kasanStart: 6,
    kasanPairs: 35,
    points: 76,
    count: 77,
    dayStart: 78,
  },
  /** 医科診療行為 */
  SI: { code: 3, qty: 4, points: 5, count: 6, dayStart: 7 },
  /** 医薬品 */
  IY: { code: 3, qty: 4, points: 5, count: 6, dayStart: 8 },
  /** 特定器材 */
  TO: { code: 3, qty: 4, points: 8, count: 9, dayStart: 10 },
  /** コメント（直前の診療行為に付く） */
  CO: { code: 3, text: 4, teeth: 5 },
} as const;

/**
 * 患者を特定できる情報を含み、点検に使わないため丸ごと読み飛ばすレコード
 * （KO=公費受給者番号、SN=資格確認、JD=受診日等、MF=窓口負担額、SJ=症状詳記）
 */
export const DROP_RECORDS = new Set(["KO", "SN", "JD", "MF", "SJ"]);

/** 施設基準届出コード（別表5） */
export const TODOKEDE_CODES: Record<string, string> = {
  "01": "補管（クラウン・ブリッジ維持管理料）",
  "17": "歯初診（歯科初診料）",
};
