/**
 * AI に渡す前の最終フィルター。
 * そもそも氏名・保険証番号は保存していないが、メモ欄などに人が書いた内容が
 * 混ざる可能性があるため、番号らしきものを伏せる。
 */
export function maskText(s: string): string {
  return (
    s
      // 電話番号
      .replace(/0\d{1,4}-\d{1,4}-\d{3,4}/g, "［電話番号］")
      // 6桁以上の数字（保険者番号・記号番号・カルテ番号など）
      .replace(/\d{6,}/g, "［番号］")
      // 「様」「さん」の前の氏名らしき文字列
      .replace(/[\p{Script=Han}\p{Script=Katakana}\p{Script=Hiragana}]{1,6}[ 　]?[\p{Script=Han}\p{Script=Katakana}\p{Script=Hiragana}]{1,6}(?=様|さん|殿)/gu, "［氏名］")
  );
}
