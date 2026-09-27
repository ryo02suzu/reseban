"use client";

import { useState } from "react";
import { KeyRound, ShieldCheck } from "lucide-react";
import { api, errorMessage } from "@/lib/client";
import { useToast } from "./Toast";

export function SecurityClient({ totpEnabled, canDisable, home }: { totpEnabled: boolean; canDisable: boolean; home: string }) {
  const toast = useToast();
  const [enabled, setEnabled] = useState(totpEnabled);
  const [setup, setSetup] = useState<{ secret: string; qr: string } | null>(null);
  const [code, setCode] = useState("");
  const [pw, setPw] = useState({ current: "", next: "", confirm: "" });
  const [disablePw, setDisablePw] = useState("");
  const [error, setError] = useState<string>();

  const call = async (fn: () => Promise<void>) => {
    setError(undefined);
    try {
      await fn();
    } catch (e) {
      setError(errorMessage(e));
    }
  };

  return (
    <div className="grid grid-2">
      <section className="card">
        <div className="card-head">
          <ShieldCheck className="icon" size={24} aria-hidden />
          <div>
            <h2>2段階認証</h2>
            <p>ログイン時に、パスワードに加えてスマートフォンの認証アプリの6桁コードを入力します。</p>
          </div>
        </div>
        {enabled ? (
          <>
            <p className="notice info">2段階認証は有効です。</p>
            {canDisable && (
              <div className="row" style={{ marginTop: 12, flexWrap: "nowrap" }}>
                <input type="password" placeholder="パスワード" value={disablePw} onChange={(e) => setDisablePw(e.target.value)} />
                <button
                  type="button"
                  className="btn btn-danger"
                  onClick={() =>
                    call(async () => {
                      await api("/api/account/totp", { method: "POST", json: { action: "disable", password: disablePw } });
                      setEnabled(false);
                      toast.show("2段階認証を無効にしました");
                    })
                  }
                >
                  無効にする
                </button>
              </div>
            )}
          </>
        ) : setup ? (
          <div className="grid" style={{ gap: 12 }}>
            <p className="small" style={{ margin: 0 }}>
              ① 認証アプリ（Google Authenticator、Microsoft Authenticator など）でQRコードを読み取ってください。
            </p>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={setup.qr} alt="2段階認証の設定用QRコード" width={180} height={180} style={{ border: "1px solid var(--border)", borderRadius: 8 }} />
            <p className="muted small" style={{ margin: 0 }}>
              読み取れない場合は次のキーを手入力：<code style={{ wordBreak: "break-all" }}>{setup.secret}</code>
            </p>
            <label className="field">
              <span>② アプリに表示された6桁の数字</span>
              <input
                type="text"
                inputMode="numeric"
                maxLength={6}
                value={code}
                onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))}
                style={{ maxWidth: 200, letterSpacing: 6, fontSize: 18 }}
              />
            </label>
            <button
              type="button"
              className="btn btn-primary"
              disabled={code.length !== 6}
              onClick={() =>
                call(async () => {
                  await api("/api/account/totp", { method: "POST", json: { action: "enable", code } });
                  setEnabled(true);
                  setSetup(null);
                  toast.show("2段階認証を有効にしました");
                  setTimeout(() => (window.location.href = home), 800);
                })
              }
            >
              有効にする
            </button>
          </div>
        ) : (
          <button
            type="button"
            className="btn btn-primary"
            onClick={() =>
              call(async () => {
                setSetup(await api<{ secret: string; qr: string }>("/api/account/totp", { method: "POST", json: { action: "setup" } }));
              })
            }
          >
            2段階認証を設定する
          </button>
        )}
      </section>

      <section className="card">
        <div className="card-head">
          <KeyRound className="icon" size={24} aria-hidden />
          <div>
            <h2>パスワードの変更</h2>
            <p>変更すると、ほかの端末のログインは解除されます。</p>
          </div>
        </div>
        <form
          className="grid"
          style={{ gap: 12 }}
          onSubmit={(e) => {
            e.preventDefault();
            call(async () => {
              if (pw.next !== pw.confirm) throw new Error("確認用のパスワードが一致しません");
              await api("/api/account/password", { method: "POST", json: { current: pw.current, next: pw.next } });
              setPw({ current: "", next: "", confirm: "" });
              toast.show("パスワードを変更しました");
            });
          }}
        >
          <label className="field">
            <span>今のパスワード</span>
            <input type="password" autoComplete="current-password" value={pw.current} onChange={(e) => setPw({ ...pw, current: e.target.value })} />
          </label>
          <label className="field">
            <span>新しいパスワード（12文字以上・2種類以上の文字）</span>
            <input type="password" autoComplete="new-password" value={pw.next} onChange={(e) => setPw({ ...pw, next: e.target.value })} />
          </label>
          <label className="field">
            <span>新しいパスワード（確認）</span>
            <input type="password" autoComplete="new-password" value={pw.confirm} onChange={(e) => setPw({ ...pw, confirm: e.target.value })} />
          </label>
          <button type="submit" className="btn btn-primary" disabled={!pw.current || !pw.next}>
            変更する
          </button>
        </form>
      </section>
      {error && (
        <p className="notice error" role="alert" style={{ gridColumn: "1 / -1" }}>
          {error}
        </p>
      )}
      {toast.node}
    </div>
  );
}
