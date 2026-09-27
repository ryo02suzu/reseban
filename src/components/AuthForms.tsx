"use client";

import Link from "next/link";
import { useState } from "react";
import { api, errorMessage } from "@/lib/client";

function useSubmit() {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();
  const run = async (fn: () => Promise<void>) => {
    setBusy(true);
    setError(undefined);
    try {
      await fn();
    } catch (e) {
      setError(errorMessage(e));
      setBusy(false);
    }
  };
  return { busy, error, run };
}

export function LoginForm() {
  const { busy, error, run } = useSubmit();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        run(async () => {
          const { next } = await api<{ next: string }>("/api/auth/login", { method: "POST", json: { email, password } });
          window.location.assign(next === "2fa" ? "/login/2fa" : next);
        });
      }}
    >
      <label className="field">
        <span>メールアドレス</span>
        <input type="text" inputMode="email" autoComplete="username" value={email} onChange={(e) => setEmail(e.target.value)} required />
      </label>
      <label className="field">
        <span>パスワード</span>
        <input type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} required />
      </label>
      {error && <p className="notice error" role="alert">{error}</p>}
      <button type="submit" className="btn btn-primary btn-lg" disabled={busy}>
        {busy ? "確認中…" : "ログイン"}
      </button>
      <p className="muted small" style={{ margin: 0 }}>
        パスワードを忘れた場合は、医院の管理者（管理者の方は運営者）に再設定リンクの発行を依頼してください。
      </p>
    </form>
  );
}

export function TwoFactorForm() {
  const { busy, error, run } = useSubmit();
  const [code, setCode] = useState("");
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        run(async () => {
          const { next } = await api<{ next: string }>("/api/auth/2fa", { method: "POST", json: { code } });
          window.location.assign(next);
        });
      }}
    >
      <p className="muted small" style={{ margin: 0 }}>
        認証アプリ（Google Authenticator など）に表示されている6桁の数字を入力してください。
      </p>
      <label className="field">
        <span>確認コード</span>
        <input
          type="text"
          inputMode="numeric"
          autoComplete="one-time-code"
          maxLength={6}
          value={code}
          onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))}
          style={{ fontSize: 22, letterSpacing: 8, textAlign: "center" }}
          autoFocus
          required
        />
      </label>
      {error && <p className="notice error" role="alert">{error}</p>}
      <button type="submit" className="btn btn-primary btn-lg" disabled={busy || code.length !== 6}>
        {busy ? "確認中…" : "確認"}
      </button>
      <Link href="/login" className="small" style={{ textAlign: "center" }}>
        最初からやり直す
      </Link>
    </form>
  );
}

export function AcceptForm({ token, kind, email }: { token: string; kind: "invite" | "reset"; email: string }) {
  const { busy, error, run } = useSubmit();
  const [name, setName] = useState("");
  const [mail, setMail] = useState(email);
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [agree, setAgree] = useState(false);
  const mismatch = confirm.length > 0 && password !== confirm;
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        run(async () => {
          const { next } = await api<{ next: string }>("/api/auth/accept", {
            method: "POST",
            json: { token, name, email: mail, password, agree },
          });
          window.location.assign(next);
        });
      }}
    >
      {kind === "invite" && (
        <>
          <label className="field">
            <span>メールアドレス（ログインID）</span>
            <input type="text" value={mail} onChange={(e) => setMail(e.target.value)} readOnly={!!email} required />
          </label>
          <label className="field">
            <span>お名前</span>
            <input type="text" value={name} onChange={(e) => setName(e.target.value)} placeholder="例：山田 花子" required />
          </label>
        </>
      )}
      <label className="field">
        <span>{kind === "invite" ? "パスワード" : "新しいパスワード"}</span>
        <input type="password" autoComplete="new-password" value={password} onChange={(e) => setPassword(e.target.value)} required />
      </label>
      <label className="field">
        <span>パスワード（確認）</span>
        <input type="password" autoComplete="new-password" value={confirm} onChange={(e) => setConfirm(e.target.value)} required />
      </label>
      <p className="muted small" style={{ margin: 0 }}>
        12文字以上で、英字・数字・記号のうち2種類以上を混ぜてください。
      </p>
      {kind === "invite" && (
        <label className="check">
          <input type="checkbox" checked={agree} onChange={(e) => setAgree(e.target.checked)} />
          <span>
            <a href="/legal/terms" target="_blank">利用規約</a>と<a href="/legal/privacy" target="_blank">プライバシーポリシー</a>に同意します
          </span>
        </label>
      )}
      {mismatch && <p className="notice error">確認用のパスワードが一致しません</p>}
      {error && <p className="notice error" role="alert">{error}</p>}
      <button type="submit" className="btn btn-primary btn-lg" disabled={busy || mismatch || (kind === "invite" && !agree)}>
        {busy ? "登録中…" : kind === "invite" ? "登録して始める" : "パスワードを設定"}
      </button>
    </form>
  );
}

export function TermsAcceptForm() {
  const { busy, error, run } = useSubmit();
  const [agree, setAgree] = useState(false);
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        run(async () => {
          await api("/api/account/terms", { method: "POST", json: { agree } });
          // ログイン状態が変わるので、画面の状態をすべて捨てて読み直す
          // eslint-disable-next-line @next/next/no-location-assign-relative-destination
          window.location.assign("/");
        });
      }}
    >
      <label className="check">
        <input type="checkbox" checked={agree} onChange={(e) => setAgree(e.target.checked)} />
        <span>
          <a href="/legal/terms" target="_blank">利用規約</a>と<a href="/legal/privacy" target="_blank">プライバシーポリシー</a>に同意します
        </span>
      </label>
      {error && <p className="notice error">{error}</p>}
      <button type="submit" className="btn btn-primary" disabled={busy || !agree}>
        同意して続ける
      </button>
    </form>
  );
}
