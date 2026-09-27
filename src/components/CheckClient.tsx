"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useRef, useState } from "react";
import { Check, FileText, FlaskConical, Info, Play, ShieldCheck, Trash2, X, IdCard, ArrowRight } from "lucide-react";
import type { AuditRunListItem } from "@/lib/types";
import { decodeUke, detectMonth } from "@/lib/uke/text";
import { monthsBack } from "@/lib/rules/engine";
import { formatDateTime, formatMonth } from "@/lib/format";
import { api, errorMessage } from "@/lib/client";

interface Picked {
  file: File;
  month?: string;
}

async function pick(file: File): Promise<Picked> {
  try {
    const month = detectMonth(decodeUke(await file.arrayBuffer()));
    return { file, month };
  } catch {
    return { file };
  }
}

function thisMonth() {
  const d = new Date();
  return `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, "0")}`;
}

function fileSize(n: number) {
  return n >= 1024 * 1024 ? `${(n / 1024 / 1024).toFixed(1)} MB` : `${Math.max(1, Math.round(n / 1024))} KB`;
}

export function CheckClient({
  runs: initialRuns,
  storedMonths,
  canDelete,
}: {
  runs: AuditRunListItem[];
  storedMonths: string[];
  canDelete: boolean;
}) {
  const router = useRouter();
  const [runs, setRuns] = useState(initialRuns);
  const [current, setCurrent] = useState<Picked | null>(null);
  const [history, setHistory] = useState<Picked[]>([]);
  const [busy, setBusy] = useState<"run" | "demo" | null>(null);
  const [error, setError] = useState<string>();
  const [drag, setDrag] = useState(false);
  const currentInput = useRef<HTMLInputElement>(null);
  const historyInput = useRef<HTMLInputElement>(null);

  const base = current?.month ?? thisMonth();
  const pastMonths = Array.from({ length: 6 }, (_, i) => monthsBack(base, 6 - i));
  const covered = new Set([...storedMonths, ...history.map((h) => h.month).filter(Boolean)] as string[]);
  const okCount = pastMonths.filter((m) => covered.has(m)).length;

  const setCurrentFile = async (f?: File) => {
    if (!f) return;
    setError(undefined);
    setCurrent(await pick(f));
  };

  const addHistory = async (files: File[]) => {
    const picked = await Promise.all(files.map(pick));
    setHistory((h) => [...h, ...picked].slice(-12));
  };

  const start = async () => {
    if (!current) return;
    setBusy("run");
    setError(undefined);
    try {
      const fd = new FormData();
      fd.append("current", current.file);
      history.forEach((h) => fd.append("history", h.file));
      const { id } = await api<{ id: string }>("/api/audits", { method: "POST", body: fd });
      router.push(`/report/${id}`);
    } catch (e) {
      setError(errorMessage(e));
      setBusy(null);
    }
  };

  const demo = async () => {
    setBusy("demo");
    setError(undefined);
    try {
      const { id } = await api<{ id: string }>("/api/audits/demo", { method: "POST" });
      router.push(`/report/${id}`);
    } catch (e) {
      setError(errorMessage(e));
      setBusy(null);
    }
  };

  const remove = async (id: string) => {
    if (!confirm("このチェック結果を削除しますか？（元に戻せません）")) return;
    try {
      await api(`/api/audits/${id}`, { method: "DELETE" });
      setRuns((r) => r.filter((x) => x.id !== id));
    } catch (e) {
      setError(errorMessage(e));
    }
  };

  return (
    <>
      <div className="grid grid-main-side">
        <section className="card">
          {/* ① 当月 */}
          <div className="step-title">
            <span className="step-num">1</span>
            <h2>当月のファイルを選ぶ</h2>
          </div>
          <div className="grid grid-2" style={{ gap: 16 }}>
            <div
              className={`dropzone${drag ? " active" : ""}`}
              onDragOver={(e) => {
                e.preventDefault();
                setDrag(true);
              }}
              onDragLeave={() => setDrag(false)}
              onDrop={(e) => {
                e.preventDefault();
                setDrag(false);
                setCurrentFile(e.dataTransfer.files[0]);
              }}
            >
              <FileText size={32} color="var(--primary)" aria-hidden />
              <div className="dz-body">
                ここにファイルをドラッグ＆ドロップ
                <br />
                または
                <div style={{ marginTop: 8 }}>
                  <button type="button" className="btn btn-outline btn-sm" onClick={() => currentInput.current?.click()}>
                    ファイルを選択
                  </button>
                </div>
              </div>
              <input
                ref={currentInput}
                type="file"
                accept=".UKE,.uke"
                hidden
                onChange={(e) => {
                  setCurrentFile(e.target.files?.[0]);
                  e.target.value = "";
                }}
              />
            </div>
            {current ? (
              <div className="file-card">
                <FileText size={28} color="var(--primary)" aria-hidden />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div className="name">{current.file.name}</div>
                  <div className="muted small">
                    {fileSize(current.file.size)} ・ {formatDateTime(new Date(current.file.lastModified).toISOString())}
                  </div>
                  {!current.month && <div className="small" style={{ color: "var(--henrei)", marginTop: 4 }}>レセ電ファイルとして読めませんでした</div>}
                </div>
                {current.month && <span className="badge month">{formatMonth(current.month)}分</span>}
                <button type="button" className="icon-btn" aria-label="ファイルを外す" onClick={() => setCurrent(null)}>
                  <X size={16} />
                </button>
              </div>
            ) : (
              <div className="file-card" style={{ alignItems: "center", justifyContent: "center", color: "var(--muted)" }}>
                まだ選ばれていません
              </div>
            )}
          </div>

          <hr className="divider" />

          {/* ② 過去分 */}
          <div className="grid" style={{ gridTemplateColumns: "minmax(0, 1fr) auto", alignItems: "start" }}>
            <div>
              <div className="step-title" style={{ marginBottom: 4 }}>
                <span className="step-num">2</span>
                <h2>
                  過去分を追加 <span className="muted" style={{ fontWeight: 400, fontSize: 14 }}>（複数選択可）</span>
                </h2>
              </div>
              <p className="muted small" style={{ margin: "0 0 10px 42px" }}>
                過去6ヶ月分を入れてください。一度入れた月は保存され、次回からは不要です。
              </p>
              <div style={{ marginLeft: 42 }}>
                <button type="button" className="btn" style={{ minWidth: 170 }} onClick={() => historyInput.current?.click()}>
                  ファイルを選択
                </button>
                <input
                  ref={historyInput}
                  type="file"
                  accept=".UKE,.uke"
                  multiple
                  hidden
                  onChange={(e) => {
                    addHistory(Array.from(e.target.files ?? []));
                    e.target.value = "";
                  }}
                />
                {history.length > 0 && (
                  <div className="file-chips">
                    {history.map((h, i) => (
                      <span className="file-chip" key={`${h.file.name}-${i}`}>
                        {h.month ? formatMonth(h.month) : "年月不明"}・{h.file.name}
                        <button
                          type="button"
                          className="icon-btn"
                          style={{ padding: 2 }}
                          aria-label="外す"
                          onClick={() => setHistory((x) => x.filter((_, j) => j !== i))}
                        >
                          <X size={12} />
                        </button>
                      </span>
                    ))}
                  </div>
                )}
              </div>
            </div>
            <div>
              <div className="month-tiles">
                {pastMonths.map((m) => (
                  <div key={m} className={`month-tile ${covered.has(m) ? "ok" : "missing"}`}>
                    {Number(m.slice(4))}月
                    <div className="mark">{covered.has(m) ? <Check size={18} /> : "—"}</div>
                  </div>
                ))}
              </div>
              <p className="small" style={{ textAlign: "right", margin: "8px 0 0", color: okCount === 6 ? "var(--more)" : "var(--satei)", fontWeight: 600 }}>
                6ヶ月中{okCount}ヶ月分 入っています
              </p>
            </div>
          </div>

          <hr className="divider" />

          {error && (
            <p className="notice error" role="alert" style={{ marginTop: 0 }}>
              {error}
            </p>
          )}
          <div className="row" style={{ alignItems: "flex-start" }}>
            <div>
              <button type="button" className="btn btn-outline" style={{ minWidth: 220 }} disabled={!!busy} onClick={demo}>
                <FlaskConical size={18} aria-hidden />
                {busy === "demo" ? "準備中…" : "サンプルデータで試す"}
              </button>
              <div className="info-line" style={{ marginTop: 10 }}>
                <Info size={16} aria-hidden />
                氏名・保険証番号は取り込み時に捨て、保存しません。
              </div>
            </div>
            <span className="spacer" />
            <div style={{ textAlign: "right" }}>
              <button type="button" className="btn btn-primary btn-lg" style={{ minWidth: 240 }} disabled={!current?.month || !!busy} onClick={start}>
                <Play size={18} fill="currentColor" aria-hidden />
                {busy === "run" ? "チェック中…" : "チェック開始"}
              </button>
              {!current && <div className="muted small" style={{ marginTop: 6 }}>※ 当月のファイルが選択されていません。</div>}
              {current && !current.month && <div className="small" style={{ marginTop: 6, color: "var(--henrei)" }}>※ レセ電ファイル（.UKE）を選んでください。</div>}
            </div>
          </div>
        </section>

        <aside className="card" style={{ alignSelf: "start" }}>
          <div className="card-head">
            <ShieldCheck className="icon" size={22} aria-hidden />
            <h2>データの取り扱いについて</h2>
          </div>
          <p style={{ margin: 0 }}>氏名・保険証番号は取り込み時に捨て、保存しません。</p>
          <div className="row" style={{ justifyContent: "center", gap: 18, margin: "18px 0", color: "var(--muted)" }}>
            <IdCard size={48} strokeWidth={1.3} color="var(--text)" aria-hidden />
            <ArrowRight size={20} aria-hidden />
            <Trash2 size={44} strokeWidth={1.3} color="var(--text)" aria-hidden />
          </div>
          <p className="muted small" style={{ margin: 0 }}>
            患者はカルテ番号と匿名キーで扱います。AIに渡すのは項目名・病名・部位などだけで、カルテ番号も渡しません。
          </p>
        </aside>
      </div>

      <section className="card" style={{ marginTop: 20 }}>
        <h2 style={{ marginBottom: 16 }}>これまでのチェック一覧</h2>
        {runs.length === 0 ? (
          <p className="empty">まだチェックしていません。上でファイルを選ぶか、サンプルデータで試してください。</p>
        ) : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>診療月</th>
                  <th>実行日時</th>
                  <th className="num">レセ件数</th>
                  <th className="num">返戻リスク件数</th>
                  <th className="num">査定リスク</th>
                  <th className="num">算定漏れ</th>
                  <th style={{ width: 130 }}>操作</th>
                </tr>
              </thead>
              <tbody>
                {runs.map((r) => (
                  <tr key={r.id}>
                    <td>
                      {formatMonth(r.targetMonth)}
                      {r.demo && (
                        <span className="badge neutral" style={{ marginLeft: 8 }}>
                          サンプル
                        </span>
                      )}
                    </td>
                    <td className="muted">{formatDateTime(r.createdAt)}</td>
                    <td className="num">{r.summary.receiptCount.toLocaleString()}</td>
                    <td className="num">{r.summary.henreiCount}</td>
                    <td className="num">¥{r.summary.sateiYen.toLocaleString()}</td>
                    <td className="num">¥{r.summary.moreYen.toLocaleString()}</td>
                    <td>
                      <div className="row" style={{ flexWrap: "nowrap" }}>
                        <Link className="btn btn-outline btn-sm" href={`/report/${r.id}`}>
                          開く
                        </Link>
                        {canDelete && (
                          <button type="button" className="icon-btn danger" aria-label="削除" onClick={() => remove(r.id)}>
                            <Trash2 size={18} />
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </>
  );
}
