"use client";

import { useRef, useState } from "react";

interface Picked {
  file: File;
  /** ファイル内の請求年月（読めた場合） */
  month?: string;
}

function monthLabel(ym?: string) {
  if (!ym || ym.length !== 6) return "年月不明";
  return `${ym.slice(0, 4)}年${Number(ym.slice(4))}月`;
}

function DropZone({
  title,
  hint,
  multiple,
  files,
  onAdd,
  onRemove,
  buttonLabel,
}: {
  title: string;
  hint: string;
  multiple?: boolean;
  files: Picked[];
  onAdd: (files: File[]) => void;
  onRemove: (i: number) => void;
  buttonLabel: string;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [active, setActive] = useState(false);
  return (
    <div
      className={`dropzone${active ? " active" : ""}`}
      onDragOver={(e) => {
        e.preventDefault();
        setActive(true);
      }}
      onDragLeave={() => setActive(false)}
      onDrop={(e) => {
        e.preventDefault();
        setActive(false);
        onAdd(Array.from(e.dataTransfer.files));
      }}
    >
      <h3>{title}</h3>
      <p className="muted small" style={{ margin: "0 0 12px" }}>
        {hint}
      </p>
      <button type="button" className="btn" onClick={() => inputRef.current?.click()}>
        {buttonLabel}
      </button>
      <input
        ref={inputRef}
        type="file"
        accept=".UKE,.uke,.csv,.txt"
        multiple={multiple}
        onChange={(e) => {
          onAdd(Array.from(e.target.files ?? []));
          e.target.value = "";
        }}
      />
      {files.length > 0 && (
        <ul className="file-list">
          {files.map((p, i) => (
            <li key={`${p.file.name}-${i}`}>
              <span className="badge neutral">{monthLabel(p.month)}</span>
              <span className="mono small">{p.file.name}</span>
              <span className="spacer" />
              <button type="button" className="btn btn-sm" onClick={() => onRemove(i)} aria-label="ファイルを外す">
                外す
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export function UploadPanel({
  onRun,
  onDemo,
}: {
  onRun: (current: File, history: File[]) => Promise<void>;
  onDemo: () => Promise<void>;
}) {
  const [current, setCurrent] = useState<Picked[]>([]);
  const [history, setHistory] = useState<Picked[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();

  const toPicked = (files: File[]) => files.map((file) => ({ file }));

  const run = async (fn: () => Promise<void>) => {
    setBusy(true);
    setError(undefined);
    try {
      await fn();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="card">
      <h2>レセ電データを取り込んでチェック</h2>
      <div className="grid-2">
        <DropZone
          title="① 当月分"
          hint="請求するレセ電ファイル（RECEIPTC.UKE）を1つ"
          files={current}
          onAdd={(f) => setCurrent(toPicked(f.slice(0, 1)))}
          onRemove={() => setCurrent([])}
          buttonLabel="当月のファイルを選ぶ"
        />
        <DropZone
          title="② 過去6ヶ月分"
          hint="回数・間隔や前提検査を見るために使います（複数選択可）"
          multiple
          files={history}
          onAdd={(f) => setHistory((h) => [...h, ...toPicked(f)].slice(0, 12))}
          onRemove={(i) => setHistory((h) => h.filter((_, j) => j !== i))}
          buttonLabel="過去分を追加"
        />
      </div>
      {error && (
        <p className="notice" role="alert" style={{ marginTop: 16 }}>
          {error}
        </p>
      )}
      <div className="row" style={{ marginTop: 16 }}>
        <button
          type="button"
          className="btn btn-primary btn-lg"
          disabled={busy || current.length === 0}
          onClick={() =>
            run(() =>
              onRun(
                current[0].file,
                history.map((h) => h.file),
              ),
            )
          }
        >
          {busy ? "チェック中…" : "チェック開始"}
        </button>
        <button type="button" className="btn" disabled={busy} onClick={() => run(onDemo)}>
          サンプルデータで試す
        </button>
        <span className="spacer" />
        <span className="muted small">氏名・保険証番号は取り込み時に捨て、保存しません</span>
      </div>
    </section>
  );
}
