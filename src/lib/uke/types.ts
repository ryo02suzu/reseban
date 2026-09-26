/** 解析済みレセプト。氏名・保険証番号・生年月日は含まない。 */
export interface ParsedReceipt {
  receiptNo: string;
  /** 診療年月 YYYYMM */
  month: string;
  karteNo: string;
  /** 月をまたいで同じ患者を結びつけるための匿名キー */
  patientKey: string;
  sex: string;
  totalPoints: number;
  diagnoses: Diagnosis[];
  acts: Act[];
}

export interface Diagnosis {
  code: string;
  name: string;
  teeth: string[];
  startDate?: string;
  outcome?: string;
}

export interface Act {
  code: string;
  /** マスターで引いた名称（未取込なら空） */
  name: string;
  points: number;
  count: number;
  /** 算定日 YYYY-MM-DD（回数分ではなく日付の一覧） */
  dates: string[];
  teeth: string[];
  comments: ActComment[];
  record: "SS" | "IY" | "TO";
}

export interface ActComment {
  code: string;
  text: string;
}

export interface ParsedFile {
  clinicCode: string;
  clinicName: string;
  billingMonth: string;
  /** ファイル内で最も多い診療年月 */
  month: string;
  receipts: ParsedReceipt[];
  warnings: string[];
}
