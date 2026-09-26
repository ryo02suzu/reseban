"use client";

import { useState } from "react";
import type { Finding, FindingStatus } from "@/lib/types";
import { CATEGORY_LABELS, IMPACT_LABELS, STATUS_LABELS } from "@/lib/types";
import { formatDate, formatMonth, formatYen } from "@/lib/format";

export function FindingCard({
  f,
  aiEnabled,
  onStatus,
  onExplain,
  onMemo,
}: {
  f: Finding;
  aiEnabled: boolean;
  onStatus: (status: FindingStatus) => void;
  onExplain: () => Promise<void>;
  onMemo: (memo: string) => void;
}) {
  const [explaining, setExplaining] = useState(false);
  const [editingMemo, setEditingMemo] = useState(false);
  const [memo, setMemo] = useState(f.memo ?? "");
  const [error, setError] = useState<string>();

  const amountLabel =
    f.impact === "more" ? `+${formatYen(f.amountYen)}` : f.impact === "satei" ? `−${formatYen(f.amountYen)}` : formatYen(f.amountYen);

  return (
    <article className={`finding ${f.impact}${f.status !== "open" ? " done" : ""}`}>
      <div className="finding-head">
        <span className={`badge ${f.impact}`}>{IMPACT_LABELS[f.impact]}</span>
        <span className="badge neutral">{CATEGORY_LABELS[f.category]}</span>
        <span className="finding-title">{f.itemName ?? f.ruleName}</span>
        <span className="spacer" />
        <span className="amount">{amountLabel}</span>
      </div>
      <div className="row small muted">
        <span>カルテ番号 <b className="mono">{f.karteNo || "—"}</b></span>
        <span>レセ番号 <span className="mono">{f.receiptNo}</span></span>
        <span>{formatMonth(f.month)}{f.date ? ` ${formatDate(f.date)}` : ""}</span>
        {f.tooth && <span>部位 {f.tooth}</span>}
        {f.status !== "open" && <span className="badge outline">{STATUS_LABELS[f.status]}</span>}
      </div>
      <dl>
        <dt>理由</dt>
        <dd>{f.reason}</dd>
        <dt>根拠</dt>
        <dd>{f.basis}</dd>
        <dt>直し方</dt>
        <dd>
          <b>{f.fix}</b>
        </dd>
      </dl>
      {f.aiExplanation && (
        <div className="ai-box">
          <span className="badge ai">AIの説明</span> {f.aiExplanation}
          <span className="ai-note">
            ※判定はルールで行っています。AIの説明は補足です。最終確認は告示・通知の原文で。
          </span>
        </div>
      )}
      {f.memo && !editingMemo && <p className="small">メモ：{f.memo}</p>}
      {editingMemo && (
        <div className="row" style={{ margin: "8px 0" }}>
          <input
            type="text"
            value={memo}
            onChange={(e) => setMemo(e.target.value)}
            placeholder="院内向けメモ（例：Dr確認待ち）"
            style={{ flex: 1, minWidth: 200 }}
          />
          <button
            type="button"
            className="btn btn-sm btn-primary"
            onClick={() => {
              onMemo(memo);
              setEditingMemo(false);
            }}
          >
            保存
          </button>
        </div>
      )}
      {error && <p className="notice small">{error}</p>}
      <div className="row no-print">
        {f.status === "open" ? (
          <>
            <button type="button" className="btn btn-sm btn-primary" onClick={() => onStatus("fixed")}>
              対応済みにする
            </button>
            <button type="button" className="btn btn-sm" onClick={() => onStatus("ignored")}>
              問題なし（除外）
            </button>
          </>
        ) : (
          <button type="button" className="btn btn-sm" onClick={() => onStatus("open")}>
            未対応に戻す
          </button>
        )}
        <button type="button" className="btn btn-sm" onClick={() => setEditingMemo((v) => !v)}>
          メモ
        </button>
        <span className="spacer" />
        <button
          type="button"
          className="btn btn-sm btn-ai"
          disabled={!aiEnabled || explaining}
          title={aiEnabled ? "" : "設定でAIを有効にしてください"}
          onClick={async () => {
            setExplaining(true);
            setError(undefined);
            try {
              await onExplain();
            } catch (e) {
              setError(e instanceof Error ? e.message : String(e));
            } finally {
              setExplaining(false);
            }
          }}
        >
          {explaining ? "AIが説明を作成中…" : f.aiExplanation ? "AIで説明し直す" : "AIで根拠を説明"}
        </button>
      </div>
    </article>
  );
}
