"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useRef, useState } from "react";
import { Check, Plus, Trash2, Upload, X } from "lucide-react";
import { api, errorMessage } from "@/lib/client";
import { formatMonth } from "@/lib/format";
import type { ClaimHistoryRow } from "@/lib/rules/types";
import type { OutcomeSummary } from "@/lib/rules/outcome";

const KIND_LABELS = { henrei: "返戻", satei: "査定" } as const;

function lastMonth() {
  const d = new Date();
  d.setDate(1);
  d.setMonth(d.getMonth() - 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

const empty = () => ({ month: lastMonth(), kind: "satei" as "henrei" | "satei", patientId: "", itemName: "", reason: "", points: "" });

export function ClaimsClient({
  initialRows,
  outcomes,
  canImport,
}: {
  initialRows: ClaimHistoryRow[];
  outcomes: (OutcomeSummary & { runId: string })[];
  canImport: boolean;
}) {
  const router = useRouter();
  const [rows, setRows] = useState(initialRows);
  const [form, setForm] = useState(empty);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();
  const fileRef = useRef<HTMLInputElement>(null);

  const byMonth = useMemo(() => {
    const m = new Map<string, ClaimHistoryRow[]>();
    for (const r of rows) m.set(r.month, [...(m.get(r.month) ?? []), r]);
    return [...m].sort(([a], [b]) => b.localeCompare(a));
  }, [rows]);

  const add = async () => {
    setBusy(true);
    setError(undefined);
    try {
      const row = await api<ClaimHistoryRow>("/api/claims", { method: "POST", json: { ...form, month: form.month.replace("-", "") } });
      setRows((r) => [...r, row]);
      setForm((f) => ({ ...empty(), month: f.month, kind: f.kind }));
      router.refresh();
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  };

  const remove = async (id?: string) => {
    if (!id || !confirm("この記録を削除しますか？")) return;
    try {
      await api(`/api/claims/${id}`, { method: "DELETE" });
      setRows((r) => r.filter((x) => x.id !== id));
      router.refresh();
    } catch (e) {
      setError(errorMessage(e));
    }
  };

  const importCsv = async (file?: File) => {
    if (!file) return;
    setBusy(true);
    setError(undefined);
    try {
      const fd = new FormData();
      fd.append("file", file);
      await api("/api/rules/history", { method: "POST", body: fd });
      const r = await api<{ rows: ClaimHistoryRow[] }>("/api/claims");
      setRows(r.rows);
      router.refresh();
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <div className="page-head">
        <div>
          <h1>返戻・査定の記録</h1>
          <p>増減点連絡書や返戻されたレセプトを見ながら記録します。ルールの優先順位づけと、レセ番の答え合わせに使います。</p>
        </div>
        {canImport && (
          <div className="actions">
            <button type="button" className="btn btn-outline" disabled={busy} onClick={() => fileRef.current?.click()}>
              <Upload size={18} aria-hidden />
              CSVでまとめて取り込む
            </button>
            <input ref={fileRef} type="file" accept=".csv,text/csv" hidden onChange={(e) => (importCsv(e.target.files?.[0]), (e.target.value = ""))} />
          </div>
        )}
      </div>

      {error && (
        <p className="notice error" role="alert">
          {error}
        </p>
      )}

      <section className="card">
        <h2 style={{ marginBottom: 12 }}>1件ずつ記録する</h2>
        <div className="claim-form">
          <label className="field">
            <span>診療年月</span>
            <input type="month" value={form.month} onChange={(e) => setForm({ ...form, month: e.target.value })} />
          </label>
          <label className="field">
            <span>区分</span>
            <select value={form.kind} onChange={(e) => setForm({ ...form, kind: e.target.value as "henrei" | "satei" })}>
              <option value="satei">査定（減点）</option>
              <option value="henrei">返戻</option>
            </select>
          </label>
          <label className="field">
            <span>カルテ番号（任意）</span>
            <input type="text" value={form.patientId} onChange={(e) => setForm({ ...form, patientId: e.target.value })} placeholder="患者IDでも可" />
          </label>
          <label className="field">
            <span>項目名</span>
            <input type="text" value={form.itemName} onChange={(e) => setForm({ ...form, itemName: e.target.value })} placeholder="例：歯科疾患管理料" />
          </label>
          <label className="field">
            <span>事由</span>
            <input type="text" value={form.reason} onChange={(e) => setForm({ ...form, reason: e.target.value })} placeholder="例：A（適応外）、回数超過" />
          </label>
          <label className="field">
            <span>点数</span>
            <input type="number" min={0} value={form.points} onChange={(e) => setForm({ ...form, points: e.target.value })} placeholder="例：100" />
          </label>
          <button type="button" className="btn btn-primary" disabled={busy || !form.itemName.trim()} onClick={add} style={{ alignSelf: "end" }}>
            <Plus size={18} aria-hidden />
            追加
          </button>
        </div>
        <p className="muted small" style={{ margin: "8px 0 0" }}>
          カルテ番号を入れると、同じ患者への指摘だけを「的中」として数えます。氏名は入れないでください。
        </p>
      </section>

      <section className="card" style={{ marginTop: 20 }}>
        <h2 style={{ marginBottom: 4 }}>答え合わせ</h2>
        <p className="muted small" style={{ margin: "0 0 12px" }}>
          実際に返戻・査定された項目を、その月のチェックでレセ番が指摘できていたか。見逃した項目は、ルールを追加する候補です。
        </p>
        {outcomes.length === 0 ? (
          <p className="empty">記録のある月のチェック結果がまだありません。同じ診療月のレセプトをチェックすると、ここに答え合わせが出ます。</p>
        ) : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>診療月</th>
                  <th className="num">返戻・査定</th>
                  <th className="num">指摘できた</th>
                  <th className="num">的中率</th>
                  <th>見逃した項目</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {outcomes.map((o) => (
                  <tr key={o.month}>
                    <td>{formatMonth(o.month)}</td>
                    <td className="num">{o.total}件</td>
                    <td className="num">{o.caught}件</td>
                    <td className="num">
                      <b>{o.total ? Math.round((o.caught / o.total) * 100) : 0}%</b>
                    </td>
                    <td className="small">
                      {o.rows
                        .filter((r) => !r.findingId)
                        .map((r) => r.row.itemName)
                        .join("、") || "—"}
                    </td>
                    <td>
                      <Link className="btn btn-outline btn-sm" href={`/report/${o.runId}`}>
                        レポート
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section className="card" style={{ marginTop: 20 }}>
        <h2 style={{ marginBottom: 12 }}>記録の一覧（{rows.length}件）</h2>
        {byMonth.length === 0 ? (
          <p className="empty">まだ記録がありません。</p>
        ) : (
          byMonth.map(([month, list]) => {
            const o = outcomes.find((x) => x.month === month);
            return (
              <div key={month} style={{ marginBottom: 18 }}>
                <h3 style={{ fontSize: 15, margin: "0 0 6px" }}>{formatMonth(month)}</h3>
                <div className="table-wrap">
                  <table>
                    <thead>
                      <tr>
                        <th style={{ width: 70 }}>区分</th>
                        <th>項目名</th>
                        <th>事由</th>
                        <th className="num">点数</th>
                        <th>カルテ番号</th>
                        <th style={{ width: 120 }}>レセ番の指摘</th>
                        <th style={{ width: 50 }} />
                      </tr>
                    </thead>
                    <tbody>
                      {list.map((r) => {
                        const hit = o?.rows.find((x) => x.row.id === r.id);
                        return (
                          <tr key={r.id}>
                            <td>
                              <span className={`badge solid ${r.kind}`}>{KIND_LABELS[r.kind]}</span>
                            </td>
                            <td>{r.itemName}</td>
                            <td className="muted">{r.reason || "—"}</td>
                            <td className="num">{r.points.toLocaleString()}</td>
                            <td className="muted">{r.patientId || "—"}</td>
                            <td className="small">
                              {!o ? (
                                <span className="muted">チェック前</span>
                              ) : hit?.findingId ? (
                                <span style={{ color: "var(--more)" }}>
                                  <Check size={14} aria-hidden /> 指摘あり
                                </span>
                              ) : (
                                <span style={{ color: "var(--henrei)" }}>
                                  <X size={14} aria-hidden /> 見逃し
                                </span>
                              )}
                            </td>
                            <td>
                              <button type="button" className="icon-btn danger" aria-label="削除" onClick={() => remove(r.id)}>
                                <Trash2 size={16} />
                              </button>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            );
          })
        )}
      </section>
    </>
  );
}
