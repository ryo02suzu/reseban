"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useRef, useState } from "react";
import { Check, FileText, FlaskConical, Info, Play, ShieldCheck, Trash2, X, IdCard, ArrowRight } from "lucide-react";
import type { AuditRunListItem } from "@/lib/types";
import { decodeUke, detectFileInfo, PAYER_LABELS } from "@/lib/uke/text";
import { monthsBack } from "@/lib/rules/engine";
import { formatDateTime, formatMonth } from "@/lib/format";
import { api, errorMessage } from "@/lib/client";

interface Picked {
  file: File;
  month?: string;
  /** 審査支払機関（"1" 社保／"2" 国保） */
  payer?: string;
}

async function pick(file: File): Promise<Picked> {
  try {
    const info = detectFileInfo(decodeUke(await file.arrayBuffer()));
    return { file, month: info.month, payer: info.payer };
  } catch {
    return { file };
  }
}

const sameFile = (a: File, b: File) => a.name === b.name && a.size === b.size && a.lastModified === b.lastModified;

/** 選ばれたファイルを、最も新しい月＝当月、それより前＝過去分に振り分ける */
function place(current: Picked[], history: Picked[]): { current: Picked[]; history: Picked[]; moved: number } {
  const all = [...current, ...history];
  const latest = current.map((p) => p.month).filter(Boolean).sort().at(-1);
  if (!latest) return { current, history, moved: 0 };
  const cur = all.filter((p) => p.month === latest);
  const moved = current.filter((p) => p.month && p.month !== latest).length;
  const hist = all.filter((p) => p.month !== latest);
  return { current: cur, history: hist, moved };
}

function payersOf(files: Picked[]) {
  const names = [...new Set(files.map((f) => (f.payer ? PAYER_LABELS[f.payer] : undefined)).filter(Boolean))];
  return names.length ? `（${names.join("・")}）` : "";
}

function PayerBadge({ payer }: { payer?: string }) {
  if (!payer || !PAYER_LABELS[payer]) return null;
  return <span className="badge neutral">{PAYER_LABELS[payer]}</span>;
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
  const [current, setCurrent] = useState<Picked[]>([]);
  const [note, setNote] = useState<string>();
  const [history, setHistory] = useState<Picked[]>([]);
  const [busy, setBusy] = useState<"run" | "demo" | null>(null);
  const [error, setError] = useState<string>();
  const [drag, setDrag] = useState(false);
  const currentInput = useRef<HTMLInputElement>(null);
  const historyInput = useRef<HTMLInputElement>(null);

  const currentMonth = current.map((p) => p.month).filter(Boolean).sort().at(-1);
  const base = currentMonth ?? thisMonth();
  const pastMonths = Array.from({ length: 6 }, (_, i) => monthsBack(base, 6 - i));
  const covered = new Set([...storedMonths, ...history.map((h) => h.month).filter(Boolean)] as string[]);
  const okCount = pastMonths.filter((m) => covered.has(m)).length;
  const historyGroups = [
    ...history.reduce((m, h) => m.set(h.month ?? "", [...(m.get(h.month ?? "") ?? []), h]), new Map<string, Picked[]>()),
  ].sort(([a], [b]) => a.localeCompare(b));

  const addCurrent = async (files: File[]) => {
    if (!files.length) return;
    setError(undefined);
    const picked = await Promise.all(files.map(pick));
    const fresh = picked.filter((p) => ![...current, ...history].some((x) => sameFile(x.file, p.file)));
    const r = place([...current, ...fresh], history);
    setCurrent(r.current);
    setHistory(r.history.slice(-40));
    setNote(r.moved ? `当月より前の月のファイル${r.moved}件は、過去分に入れました。` : undefined);
  };

  const addHistory = async (files: File[]) => {
    const picked = await Promise.all(files.map(pick));
    const fresh = picked.filter((p) => ![...current, ...history].some((x) => sameFile(x.file, p.file)));
    // 当月と同じ月のファイル（社保・国保のもう片方など）は当月に入れる
    const same = fresh.filter((p) => currentMonth && p.month === currentMonth);
    setCurrent((c) => [...c, ...same]);
    setHistory((h) => [...h, ...fresh.filter((p) => !same.includes(p))].slice(-40));
    setNote(same.length ? `当月と同じ月のファイル${same.length}件は、当月に入れました。` : undefined);
  };

  const start = async () => {
    if (!current.length) return;
    setBusy("run");
    setError(undefined);
    try {
      const fd = new FormData();
      current.forEach((c) => fd.append("current", c.file));
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
            <h2>
              当月のファイルを選ぶ <span className="muted" style={{ fontWeight: 400, fontSize: 14 }}>（社保・国保で分かれている場合は両方）</span>
            </h2>
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
                addCurrent(Array.from(e.dataTransfer.files));
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
                multiple
                hidden
                onChange={(e) => {
                  addCurrent(Array.from(e.target.files ?? []));
                  e.target.value = "";
                }}
              />
            </div>
            {current.length ? (
              <div className="grid" style={{ gap: 8, alignContent: "start" }}>
                {current.map((c, i) => (
                  <div className="file-card" key={`${c.file.name}-${i}`}>
                    <FileText size={28} color="var(--primary)" aria-hidden />
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div className="name">{c.file.name}</div>
                      {c.month ? (
                        <div className="row" style={{ gap: 6, margin: "4px 0" }}>
                          <span className="badge month">{formatMonth(c.month)}分</span>
                          <PayerBadge payer={c.payer} />
                        </div>
                      ) : (
                        <div className="small" style={{ color: "var(--henrei)", marginTop: 4 }}>レセ電ファイルとして読めませんでした</div>
                      )}
                      <div className="muted small">
                        {fileSize(c.file.size)} ・ {formatDateTime(new Date(c.file.lastModified).toISOString())}
                      </div>
                    </div>
                    <button type="button" className="icon-btn" aria-label="ファイルを外す" onClick={() => setCurrent((x) => x.filter((_, j) => j !== i))}>
                      <X size={16} />
                    </button>
                  </div>
                ))}
              </div>
            ) : (
              <div className="file-card" style={{ alignItems: "center", justifyContent: "center", color: "var(--muted)" }}>
                まだ選ばれていません
              </div>
            )}
          </div>
          {note && (
            <p className="notice info" style={{ margin: "12px 0 0" }}>
              {note}
            </p>
          )}

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
                過去6ヶ月分を入れてください（まとめて選んでOK）。一度入れた月は保存され、次回からは不要です。
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
                    {historyGroups.map(([m, files]) => (
                      <span className="file-chip" key={m} title={files.map((h) => h.file.name).join("\n")}>
                        {m ? formatMonth(m) : "年月不明"}
                        {payersOf(files)}・{files.length}ファイル
                        <button
                          type="button"
                          className="icon-btn"
                          style={{ padding: 2 }}
                          aria-label={`${m ? formatMonth(m) : "年月不明"}のファイルを外す`}
                          onClick={() => setHistory((x) => x.filter((h) => (h.month ?? "") !== m))}
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
              <button type="button" className="btn btn-primary btn-lg" style={{ minWidth: 240 }} disabled={!currentMonth || !!busy} onClick={start}>
                <Play size={18} fill="currentColor" aria-hidden />
                {busy === "run" ? "チェック中…" : "チェック開始"}
              </button>
              {!current.length && <div className="muted small" style={{ marginTop: 6 }}>※ 当月のファイルが選択されていません。</div>}
              {current.length > 0 && !currentMonth && <div className="small" style={{ marginTop: 6, color: "var(--henrei)" }}>※ レセ電ファイル（RECEIPTS.UKE）を選んでください。</div>}
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
