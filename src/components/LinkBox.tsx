"use client";

import { useState } from "react";
import { Copy } from "lucide-react";

/** 招待・再設定リンクの表示（メールは送らないので、院内の連絡手段で本人に渡す） */
export function LinkBox({ path, note }: { path: string; note?: string }) {
  const url = typeof window === "undefined" ? path : `${window.location.origin}${path}`;
  const [copied, setCopied] = useState(false);
  return (
    <div>
      <div className="link-box">
        <code>{url}</code>
        <button
          type="button"
          className="btn btn-sm"
          onClick={async () => {
            await navigator.clipboard.writeText(url).catch(() => {});
            setCopied(true);
          }}
        >
          <Copy size={14} aria-hidden /> {copied ? "コピーしました" : "コピー"}
        </button>
      </div>
      {note && <p className="muted small" style={{ margin: "6px 0 0" }}>{note}</p>}
    </div>
  );
}
