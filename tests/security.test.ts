import { describe, expect, it } from "vitest";
import {
  base32Encode,
  decrypt,
  encrypt,
  hashPassword,
  passwordProblem,
  totpAt,
  verifyPassword,
  verifyTotp,
} from "@/lib/security/crypto";

describe("パスワード", () => {
  it("scrypt でハッシュして照合できる", async () => {
    const h = await hashPassword("correct horse 9 battery");
    expect(h.startsWith("scrypt$")).toBe(true);
    expect(await verifyPassword("correct horse 9 battery", h)).toBe(true);
    expect(await verifyPassword("wrong", h)).toBe(false);
  });

  it("弱いパスワードを弾く", () => {
    expect(passwordProblem("short1")).toContain("12文字");
    expect(passwordProblem("aaaaaaaaaaaaaaaa")).toBeTruthy();
    expect(passwordProblem("onlylowercaseletters")).toContain("2種類");
    expect(passwordProblem("tanaka2026secure", "tanaka@example.com")).toContain("メールアドレス");
    expect(passwordProblem("Clinic-Reseban-2026")).toBeNull();
  });
});

describe("2段階認証（TOTP）", () => {
  // RFC 6238 付録Bのテストベクター（SHA1, 秘密鍵 "12345678901234567890"）
  const secret = base32Encode(Buffer.from("12345678901234567890"));
  it("RFC 6238 と一致する", () => {
    expect(totpAt(secret, Math.floor(59 / 30))).toBe("287082");
    expect(totpAt(secret, Math.floor(1111111109 / 30))).toBe("081804");
  });
  it("前後30秒まで許容し、それ以外は拒否", () => {
    const now = 1111111109 * 1000;
    expect(verifyTotp(secret, "081804", now)).toBe(true);
    expect(verifyTotp(secret, "081804", now + 30_000)).toBe(true);
    expect(verifyTotp(secret, "081804", now + 120_000)).toBe(false);
    expect(verifyTotp(secret, "12345", now)).toBe(false);
  });
});

describe("保存データの暗号化", () => {
  it("暗号化・復号でき、AAD が違えば失敗する", () => {
    const c = encrypt("レセプト", "receipts:c1:202609");
    expect(c.includes(Buffer.from("レセプト"))).toBe(false);
    expect(decrypt(c, "receipts:c1:202609").toString()).toBe("レセプト");
    expect(() => decrypt(c, "receipts:c2:202609")).toThrow();
  });
});
