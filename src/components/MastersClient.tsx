"use client";

import { useRouter } from "next/navigation";
import { useRef, useState } from "react";
import { CheckCircle2, Database, ExternalLink, Sparkles, Upload, XCircle } from "lucide-react";
import { MASTER_KINDS, type MasterFileStatus, type MasterKind } from "@/lib/master/types";
import { api, errorMessage } from "@/lib/client";
import { formatDateTime } from "@/lib/format";

const SSK = "https://www.ssk.or.jp/seikyushiharai/tensuhyo/kihonmasta/index.html";

export function MastersClient({
  statuses,
  ai,
}: {
  statuses: MasterFileStatus[];
  ai: { provider: string | null; region: string; model: string; domestic: boolean };
}) {
  const router = useRouter();
  const input = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<{ results: { fileName: string; kind: MasterKind; count: number }[]; errors: string[] } | null>(null);
  const [ping, setPing] = useState<{ ok: boolean; msg: string } | null>(null);

  const upload = async (files: File[]) => {
    if (!files.length) return;
    setBusy(true);
    setResult(null);
    try {
      const fd = new FormData();
      files.forEach((f) => fd.append("files", f));
      setResult(await api("/api/admin/masters", { method: "POST", body: fd }));
      router.refresh();
    } catch (e) {
      setResult({ results: [], errors: [errorMessage(e)] });
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <div className="page-head">
        <div>
          <h1>マスター</h1>
          <p>支払基金の「基本マスター」を取り込みます。全医院で共通に使われます。改定・更新のたびに最新のものを入れてください。</p>
        </div>
        <div className="actions">
          <a className="btn" href={SSK} target="_blank" rel="noreferrer">
            <ExternalLink size={16} aria-hidden /> 支払基金のダウンロードページ
          </a>
          <button type="button" className="btn btn-primary" disabled={busy} onClick={() => input.current?.click()}>
            <Upload size={16} aria-hidden /> {busy ? "取り込み中…" : "ファイルを取り込む（複数可）"}
          </button>
          <input
            ref={input}
            type="file"
            multiple
            accept=".csv,.txt,.zip"
            hidden
            onChange={(e) => {
              upload(Array.from(e.target.files ?? []));
              e.target.value = "";
            }}
          />
        </div>
      </div>

      {result && (
        <section className="card" style={{ marginBottom: 20 }}>
          {result.results.map((r) => (
            <p key={r.fileName} className="row small" style={{ margin: "4px 0", color: "var(--more)" }}>
              <CheckCircle2 size={16} /> {r.fileName} → {MASTER_KINDS.find((k) => k.kind === r.kind)?.label}：{r.count.toLocaleString()}件
            </p>
          ))}
          {result.errors.map((e) => (
            <p key={e} className="row small" style={{ margin: "4px 0", color: "var(--henrei)" }}>
              <XCircle size={16} /> {e}
            </p>
          ))}
        </section>
      )}

      <section className="card">
        <div className="card-head">
          <Database className="icon" size={24} aria-hidden />
          <div>
            <h2>取込状況</h2>
            <p>ファイル名は支払基金のまま（例：h_ALL20260807.csv、ck_ALL_20260911.zip）にすると種類を自動で判定します。ZIPのままで構いません。</p>
          </div>
        </div>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>マスター</th>
                <th>支払基金のファイル</th>
                <th className="num">件数</th>
                <th>取込ファイル</th>
                <th>取込日時</th>
              </tr>
            </thead>
            <tbody>
              {MASTER_KINDS.map((k) => {
                const s = statuses.find((x) => x.kind === k.kind);
                return (
                  <tr key={k.kind}>
                    <td>
                      {k.label}
                      {k.required && <span className="badge neutral" style={{ marginLeft: 6 }}>必須</span>}
                    </td>
                    <td className="small muted">{k.file}</td>
                    <td className="num">{s ? s.count.toLocaleString() : <span style={{ color: k.required ? "var(--henrei)" : undefined }}>未取込</span>}</td>
                    <td className="small">{s?.fileName ?? "—"}</td>
                    <td className="small muted">{s ? formatDateTime(s.importedAt) : "—"}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>

      <section className="card">
        <div className="card-head">
          <Sparkles className="icon" size={24} aria-hidden />
          <div>
            <h2>AIの接続先</h2>
            <p>サーバーの環境変数（AI_PROVIDER など）で設定します。医療情報を扱うため国内リージョンを推奨します。</p>
          </div>
        </div>
        <p className="small">
          {ai.provider ? (
            <>
              {ai.provider === "bedrock" ? "Amazon Bedrock" : ai.provider === "vertex" ? "Google Cloud Vertex AI" : "Anthropic API"}（{ai.region}）／モデル {ai.model}
              {ai.domestic ? <span className="badge ok" style={{ marginLeft: 6 }}>国内</span> : <span className="badge neutral" style={{ marginLeft: 6, color: "var(--henrei)" }}>国外</span>}
            </>
          ) : (
            <span style={{ color: "var(--henrei)" }}>未設定</span>
          )}
        </p>
        <div className="row">
          <button
            type="button"
            className="btn btn-outline btn-sm"
            disabled={!ai.provider}
            onClick={async () => {
              setPing(null);
              try {
                const { model } = await api<{ model: string }>("/api/admin/ai-ping", { method: "POST" });
                setPing({ ok: true, msg: `接続成功：${model}` });
              } catch (e) {
                setPing({ ok: false, msg: errorMessage(e) });
              }
            }}
          >
            接続テスト
          </button>
          {ping && <span className="small" style={{ color: ping.ok ? "var(--more)" : "var(--henrei)" }}>{ping.msg}</span>}
        </div>
      </section>
    </>
  );
}
