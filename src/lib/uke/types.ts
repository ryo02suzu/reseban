/** 解析済みレセプト。氏名・カナ氏名・保険証の記号番号・生年月日は含まない。 */
export interface ParsedReceipt {
  receiptNo: string;
  /** 審査支払機関（"1" 支払基金／"2" 国保連合会）。レセプト番号は機関ごとに振られる */
  payer?: string;
  /** 診療年月 YYYYMM */
  month: string;
  /** レセプト種別コード（例 3112） */
  receiptType: string;
  inpatient: boolean;
  karteNo: string;
  /** 月をまたいで同じ患者を結びつけるための匿名キー（医院ごとの秘密値でハッシュ） */
  patientKey: string;
  sex: string;
  /** 前月末日時点の年齢（年齢制限の点検用） */
  ageStart: number | null;
  /** 当月末日時点の年齢 */
  ageEnd: number | null;
  totalPoints: number;
  /** レセ電の「届出」欄（施設基準届出コード、別表5） */
  todokede: string[];
  patientStates: string[];
  diagnoses: Diagnosis[];
  acts: Act[];
}

export interface Diagnosis {
  code: string;
  /** 修飾語を含めた表示名 */
  name: string;
  /** 傷病名マスターの基本名称 */
  baseName: string;
  /** 歯科傷病名省略名称（Ｐ、Ｐｕｌ、Ｃ など） */
  abbr: string;
  /** 歯式コード（6桁） */
  teeth: string[];
  modifiers: string[];
  uncoded: boolean;
}

export interface Act {
  code: string;
  /** マスターで引いた名称（未取込なら空） */
  name: string;
  /** レセ電に記録された点数（点数・回数算定単位の最終レコードのみ。0 はマスター点数で補う） */
  points: number;
  count: number;
  /** 算定日 YYYY-MM-DD（1日に複数回は重複して入る） */
  dates: string[];
  /** コメントの歯式などから分かった部位（6桁の歯式コード） */
  teeth: string[];
  comments: ActComment[];
  record: "SS" | "SI" | "IY" | "TO";
  /** 加算コードで記録された加算のとき、親の診療行為コード */
  parentCode?: string;
}

export interface ActComment {
  code: string;
  text: string;
  teeth: string[];
}

export interface ParsedFile {
  /** 審査支払機関（"1" 支払基金／"2" 国保連合会） */
  payer: string;
  /** マルチボリューム識別情報 */
  volume: string;
  clinicCode: string;
  clinicName: string;
  billingMonth: string;
  /** ファイル内で最も多い診療年月 */
  month: string;
  /** 受付情報・医療機関情報の「届出」欄 */
  todokede: string[];
  receipts: ParsedReceipt[];
  warnings: string[];
  /** マスターに無かったコード（取込漏れの確認用） */
  unknownCodes: string[];
}
