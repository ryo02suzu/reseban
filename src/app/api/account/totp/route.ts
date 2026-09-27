import QRCode from "qrcode";
import { forbidInDemo, handle, HttpError, readJson } from "@/lib/api";
import { actorOf, getSession } from "@/lib/auth";
import { logAction, updateUser } from "@/lib/repo/core";
import { newTotpSecret, totpUri, verifyPassword, verifyTotp } from "@/lib/security/crypto";

/**
 * 2段階認証
 *   { action: "setup" }                 → 秘密鍵を作り、QRコードを返す（まだ有効にはしない）
 *   { action: "enable", code }          → 確認コードが合えば有効にする
 *   { action: "disable", password }     → 無効にする（必須の場合は不可）
 */
export async function POST(request: Request) {
  return handle(async () => {
    const s = await getSession();
    if (!s || s.pending2fa) throw new HttpError(401, "ログインしてください");
    const body = await readJson<{ action?: string; code?: string; password?: string }>(request);
    forbidInDemo();
    if (body.action === "setup") {
      if (s.user.totpEnabled) throw new HttpError(400, "すでに有効です");
      const secret = newTotpSecret();
      await updateUser(s.user.id, { totpSecret: secret });
      const uri = totpUri(secret, s.user.email);
      return { secret, qr: await QRCode.toDataURL(uri, { margin: 1, width: 200 }) };
    }
    if (body.action === "enable") {
      if (!s.user.totpSecret || !verifyTotp(s.user.totpSecret, body.code ?? "")) throw new HttpError(400, "確認コードが違います。アプリに表示されている6桁の数字を入力してください。");
      await updateUser(s.user.id, { totpEnabled: true });
      await logAction(actorOf(s), "2fa.enable", s.user.id);
      return { ok: true };
    }
    if (body.action === "disable") {
      if (s.needs2faSetup || s.user.role === "operator" || s.clinic?.require2fa) throw new HttpError(400, "この医院では2段階認証が必須のため無効にできません");
      if (!(await verifyPassword(body.password ?? "", s.user.passwordHash))) throw new HttpError(400, "パスワードが違います");
      await updateUser(s.user.id, { totpEnabled: false, totpSecret: null });
      await logAction(actorOf(s), "2fa.disable", s.user.id);
      return { ok: true };
    }
    throw new HttpError(400, "操作が不正です");
  });
}
