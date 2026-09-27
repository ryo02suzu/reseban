import "server-only";
import { createHmac, timingSafeEqual } from "node:crypto";

/**
 * デモ環境のログイン用トークン（署名付き）。
 * デモのアカウントとパスワードは画面に公開しているため、この署名は「別インスタンスでも同じログインを復元する」ためだけのもの。
 * 本番（DEMO_MODE でない）では使わない。
 */
const secret = () => `reseban-demo:${process.env.DEMO_SESSION_SECRET ?? process.env.VERCEL_DEPLOYMENT_ID ?? ""}`;

export interface DemoToken {
  userId: string;
  expiresAt: number;
}

export function signDemoToken(t: DemoToken, nonce: string): string {
  const body = Buffer.from(JSON.stringify({ u: t.userId, e: t.expiresAt, n: nonce })).toString("base64url");
  const sig = createHmac("sha256", secret()).update(body).digest("base64url");
  return `${body}.${sig}`;
}

export function verifyDemoToken(token: string): DemoToken | null {
  const [body, sig] = token.split(".");
  if (!body || !sig) return null;
  const expected = createHmac("sha256", secret()).update(body).digest();
  const got = Buffer.from(sig, "base64url");
  if (got.length !== expected.length || !timingSafeEqual(got, expected)) return null;
  try {
    const p = JSON.parse(Buffer.from(body, "base64url").toString("utf8")) as { u?: unknown; e?: unknown };
    if (typeof p.u !== "string" || typeof p.e !== "number" || p.e < Date.now()) return null;
    return { userId: p.u, expiresAt: p.e };
  } catch {
    return null;
  }
}
