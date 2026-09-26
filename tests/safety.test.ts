import { describe, expect, it } from "vitest";
import { maskText } from "@/lib/ai/mask";
import { validateRule } from "@/lib/rules/validate";
import { BUILTIN_RULES } from "@/lib/rules/builtin";

describe("AIに渡す前のマスク", () => {
  it("番号・電話番号・氏名らしきものを伏せる", () => {
    const s = maskText("山田 太郎様 保険者番号06130000 記号12345678 電話03-1234-5678 右下6");
    expect(s).not.toContain("06130000");
    expect(s).not.toContain("12345678");
    expect(s).not.toContain("03-1234-5678");
    expect(s).not.toContain("山田");
    expect(s).toContain("右下6");
  });
});

describe("ルールの検査", () => {
  it("初期ルールはすべて妥当", () => {
    for (const r of BUILTIN_RULES) expect(() => validateRule(r)).not.toThrow();
  });

  it("不正なルールは日本語で弾く", () => {
    expect(() => validateRule({ name: "x", kind: "frequency", impact: "satei", basis: "b", fix: "f", target: { names: [] }, max: 1, per: "month" })).toThrow(
      "対象",
    );
    expect(() => validateRule({ name: "x", kind: "nope", impact: "satei" })).toThrow("種類");
    expect(() =>
      validateRule({ name: "x", kind: "frequency", impact: "satei", basis: "b", fix: "f", target: { names: ["a"] }, max: 0, per: "month" }),
    ).toThrow("上限回数");
  });

  it("施設基準の算定漏れルール", () => {
    const r = validateRule({
      name: "x",
      kind: "facility",
      impact: "more",
      basis: "b",
      fix: "f",
      standard: "S",
      mode: "missed",
      when: { names: ["初診料"] },
      expect: { names: ["加算"] },
    });
    expect(r.category).toBe("facility");
  });
});
