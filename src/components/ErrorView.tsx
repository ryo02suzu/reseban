"use client";

import { useEffect } from "react";
import { AlertTriangle, RotateCw } from "lucide-react";

/** 画面の表示中に起きたエラー（原因はサーバーのログで確認。利用者には内容を出さない） */
export function ErrorView({ error, retry }: { error: Error & { digest?: string }; retry: () => void }) {
  useEffect(() => {
    console.error(error);
  }, [error]);
  return (
    <section className="card" style={{ maxWidth: 640 }}>
      <div className="card-head">
        <AlertTriangle className="icon" size={22} aria-hidden />
        <h2>画面を表示できませんでした</h2>
      </div>
      <p>一時的な問題の可能性があります。もう一度お試しください。続く場合は、下の番号を添えて運営者にお問い合わせください。</p>
      {error.digest && <p className="muted small">エラー番号：{error.digest}</p>}
      <button type="button" className="btn btn-primary" onClick={() => retry()}>
        <RotateCw size={18} aria-hidden />
        もう一度読み込む
      </button>
    </section>
  );
}
