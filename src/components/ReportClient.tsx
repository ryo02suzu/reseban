"use client";

import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import {
  AlertTriangle,
  ChevronLeft,
  ChevronRight,
  ClipboardCheck,
  Download,
  FileWarning,
  Lightbulb,
  MessageSquare,
  Printer,
  RefreshCw,
  Search,
  Sparkles,
  X,
} from "lucide-react";
import { receiptLabel } from "@/lib/uke/text";
import type { AiSuggestion, AuditRun, CheckCategory, Finding, FindingStatus, Impact } from "@/lib/types";
import { CATEGORY_LABELS, CATEGORY_ORDER, IMPACT_LABELS, STATUS_LABELS } from "@/lib/types";
import { formatMonth } from "@/lib/format";
import { api, errorMessage } from "@/lib/client";
import { useToast } from "./Toast";

const PAGE_SIZE = 20;
const SHORT: Record<Impact, string> = { henrei: "返戻", satei: "査定", more: "漏れ" };
type Sort = "amount" | "category" | "karte";

function yen(n: number) {
  return `¥${Math.round(n).toLocaleString()}`;
}

function fmtDate(d?: string) {
  return d ? d.replaceAll("-", "/") : "—";
}

export function ReportClient({ initialRun, aiReady }: { initialRun: AuditRun; aiReady: boolean }) {
  const router = useRouter();
  const toast = useToast();
  const [run, setRun] = useState(initialRun);
  const [impact, setImpact] = useState<Impact | null>(null);
  const [category, setCategory] = useState<CheckCategory | "all">("all");
  const [status, setStatus] = useState<FindingStatus | "all">("open");
  const [query, setQuery] = useState("");
  const [sort, setSort] = useState<Sort>("amount");
  const [page, setPage] = useState(1);
  // undefined = まだ選んでいない（一覧の先頭を表示）、null = 閉じた
  const [selectedId, setSelectedId] = useState<string | null | undefined>(undefined);
  const [busy, setBusy] = useState<string | null>(null);

  const s = run.summary;

  // 状態・種類・検索で絞った一覧（カテゴリ件数はカテゴリ以外の条件で数える）
  const base = useMemo(() => {
    const q = query.trim().toLowerCase();
    return run.findings.filter(
      (f) =>
        (status === "all" || f.status === status) &&
        (!impact || f.impact === impact) &&
        (!q || f.karteNo.toLowerCase().includes(q) || (f.itemName ?? "").toLowerCase().includes(q) || f.ruleName.toLowerCase().includes(q)),
    );
  }, [run.findings, status, impact, query]);

  const list = useMemo(() => {
    const l = base.filter((f) => category === "all" || f.category === category);
    const sorted = [...l];
    if (sort === "amount") sorted.sort((a, b) => b.amountYen - a.amountYen);
    if (sort === "category") sorted.sort((a, b) => CATEGORY_ORDER.indexOf(a.category) - CATEGORY_ORDER.indexOf(b.category) || b.amountYen - a.amountYen);
    if (sort === "karte") sorted.sort((a, b) => a.karteNo.localeCompare(b.karteNo));
    return sorted;
  }, [base, category, sort]);

  const statusCounts = useMemo(() => {
    const c = { open: 0, fixed: 0, ignored: 0, all: run.findings.length };
    for (const f of run.findings) c[f.status]++;
    return c;
  }, [run.findings]);

  const pages = Math.max(1, Math.ceil(list.length / PAGE_SIZE));
  const curPage = Math.min(page, pages);
  const shown = list.slice((curPage - 1) * PAGE_SIZE, curPage * PAGE_SIZE);
  const selected = selectedId === undefined ? (list[0] ?? null) : (run.findings.find((f) => f.id === selectedId) ?? null);
  const selIndex = selected ? list.findIndex((f) => f.id === selected.id) : -1;

  const resetPage = () => setPage(1);

  const patchFinding = async (f: Finding, body: { status?: FindingStatus; memo?: string }) => {
    try {
      const res = await api<{ finding: Finding; summary: AuditRun["summary"] }>(
        `/api/audits/${run.id}/findings/${encodeURIComponent(f.id)}`,
        { method: "PATCH", json: body },
      );
      setRun((r) => ({ ...r, summary: res.summary, findings: r.findings.map((x) => (x.id === f.id ? res.finding : x)) }));
      if (body.memo !== undefined) toast.show("メモを保存しました");
    } catch (e) {
      toast.show(errorMessage(e));
    }
  };

  const explain = async (f: Finding) => {
    setBusy(`explain:${f.id}`);
    try {
      const { aiExplanation } = await api<{ aiExplanation: string }>(
        `/api/audits/${run.id}/findings/${encodeURIComponent(f.id)}/explain`,
        { method: "POST" },
      );
      setRun((r) => ({ ...r, findings: r.findings.map((x) => (x.id === f.id ? { ...x, aiExplanation } : x)) }));
    } catch (e) {
      toast.show(errorMessage(e));
    } finally {
      setBusy(null);
    }
  };

  const suggest = async () => {
    setBusy("suggest");
    try {
      const { suggestions } = await api<{ suggestions: AiSuggestion[] }>(`/api/audits/${run.id}/suggestions`, { method: "POST" });
      setRun((r) => ({ ...r, suggestions }));
      toast.show(suggestions.length ? `${suggestions.length}件の候補が見つかりました` : "候補は見つかりませんでした");
    } catch (e) {
      toast.show(errorMessage(e));
    } finally {
      setBusy(null);
    }
  };

  const setSuggestion = async (sg: AiSuggestion, st: AiSuggestion["status"]) => {
    try {
      const { suggestion } = await api<{ suggestion: AiSuggestion }>(`/api/audits/${run.id}/suggestions/${sg.id}`, {
        method: "PATCH",
        json: { status: st },
      });
      setRun((r) => ({ ...r, suggestions: r.suggestions.map((x) => (x.id === sg.id ? suggestion : x)) }));
    } catch (e) {
      toast.show(errorMessage(e));
    }
  };

  const rerun = async () => {
    setBusy("rerun");
    try {
      await api(`/api/audits/${run.id}/rerun`, { method: "POST" });
      toast.show("今のルールで再チェックしました");
      router.refresh();
    } catch (e) {
      toast.show(errorMessage(e));
    } finally {
      setBusy(null);
    }
  };

  const monthsLabel = [...run.historyMonths, run.targetMonth].map((m) => `${Number(m.slice(4))}月`).join("・");

  return (
    <>
      <div className="page-head">
        <div>
          <h1>
            {formatMonth(run.targetMonth)}診療分 点検レポート
            {run.demo && (
              <span className="badge neutral" style={{ marginLeft: 10, verticalAlign: "middle" }}>
                サンプル
              </span>
            )}
          </h1>
          <p>
            {run.clinicName || "医院名未設定"}　｜　対象レセ件数 {s.receiptCount.toLocaleString()}件　｜　対象月 {monthsLabel}
          </p>
        </div>
        <div className="actions no-print">
          <button type="button" className="btn" onClick={() => window.print()}>
            <Printer size={18} aria-hidden />
            印刷（対応済み・問題なしを非表示）
          </button>
          <a className="btn" href={`/api/audits/${run.id}/csv`}>
            <Download size={18} aria-hidden />
            CSVダウンロード
          </a>
          <button type="button" className="btn" onClick={rerun} disabled={busy === "rerun"} title="ルールや施設基準を変えたあとに押すと、今の設定でもう一度判定します">
            <RefreshCw size={18} aria-hidden />
            {busy === "rerun" ? "再チェック中…" : "再チェック"}
          </button>
          <button
            type="button"
            className="btn btn-primary"
            onClick={suggest}
            disabled={!aiReady || !!busy || run.demo}
            title={!aiReady ? "設定画面でAI機能をONにしてください" : run.demo ? "サンプルデータでは使えません" : ""}
          >
            <Sparkles size={18} aria-hidden />
            {busy === "suggest" ? "AIが探しています…" : "AIで算定漏れ候補を探す"}
          </button>
        </div>
      </div>

      <div className="stats">
        {(
          [
            ["henrei", "返戻リスク", <FileWarning key="i" size={22} />, <>{s.henreiCount}<small>件</small></>],
            ["satei", "査定リスク", <ClipboardCheck key="i" size={22} />, yen(s.sateiYen)],
            ["more", "算定漏れ", <Lightbulb key="i" size={22} />, yen(s.moreYen)],
          ] as const
        ).map(([key, label, icon, value]) => (
          <button
            key={key}
            type="button"
            className={`stat ${key}`}
            aria-pressed={impact === key}
            onClick={() => {
              setImpact(impact === key ? null : key);
              resetPage();
            }}
          >
            <span className="circle">{icon}</span>
            <span>
              <div className="label">{label}</div>
              <div className="value">{value}</div>
            </span>
            <ChevronRight className="chev" size={20} aria-hidden />
          </button>
        ))}
        {run.warnings.length > 0 ? (
          <div className="warning-card">
            <AlertTriangle size={20} aria-hidden />
            <ul>
              {run.warnings.map((w) => (
                <li key={w}>{w}</li>
              ))}
            </ul>
          </div>
        ) : (
          <div className="warning-card" style={{ background: "var(--more-soft)", borderColor: "#bfe5d0" }}>
            <span className="small">過去6ヶ月分のデータが揃っています。</span>
          </div>
        )}
      </div>

      <div className="grid grid-report">
        <section className="card">
          <h2 style={{ marginBottom: 12 }}>絞り込み</h2>
          <div className="cat-tabs no-print">
            <button type="button" aria-pressed={category === "all"} onClick={() => { setCategory("all"); resetPage(); }}>
              すべて
              <br />({base.length})
            </button>
            {CATEGORY_ORDER.map((c) => (
              <button key={c} type="button" aria-pressed={category === c} onClick={() => { setCategory(c); resetPage(); }}>
                {CATEGORY_LABELS[c]}
                <br />({base.filter((f) => f.category === c).length})
              </button>
            ))}
          </div>
          <div className="row no-print" style={{ margin: "16px 0 12px" }}>
            <span style={{ fontWeight: 600, marginRight: 8 }}>状態</span>
            <div className="seg">
              {(["open", "fixed", "ignored", "all"] as const).map((st) => (
                <button key={st} type="button" aria-pressed={status === st} onClick={() => { setStatus(st); resetPage(); }}>
                  {st === "all" ? "すべて" : STATUS_LABELS[st]}（{statusCounts[st]}）
                </button>
              ))}
            </div>
          </div>
          <div className="row no-print" style={{ marginBottom: 16, flexWrap: "nowrap" }}>
            <div className="search" style={{ flex: 1 }}>
              <Search size={16} aria-hidden />
              <input type="search" placeholder="カルテ番号・項目名で検索" value={query} onChange={(e) => { setQuery(e.target.value); resetPage(); }} />
            </div>
            <span style={{ whiteSpace: "nowrap", marginLeft: 8 }}>並び替え</span>
            <select value={sort} onChange={(e) => setSort(e.target.value as Sort)} style={{ width: 170 }}>
              <option value="amount">金額が大きい順</option>
              <option value="category">カテゴリ順</option>
              <option value="karte">カルテ番号順</option>
            </select>
          </div>

          {shown.length === 0 ? (
            <p className="empty">{run.findings.length === 0 ? "指摘はありませんでした。" : "条件に合う指摘はありません。"}</p>
          ) : (
            shown.map((f) => (
              <FindingCard
                key={f.id}
                f={f}
                selected={f.id === selected?.id}
                onSelect={() => setSelectedId(f.id)}
                onStatus={(st) => patchFinding(f, { status: st })}
                onMemo={() => setSelectedId(f.id)}
              />
            ))
          )}

          {list.length > 0 && (
            <div className="pager no-print">
              <button type="button" disabled={curPage === 1} onClick={() => setPage(curPage - 1)} aria-label="前のページ">
                <ChevronLeft size={16} />
              </button>
              {Array.from({ length: pages }, (_, i) => i + 1)
                .filter((p) => p === 1 || p === pages || Math.abs(p - curPage) <= 2)
                .map((p) => (
                  <button key={p} type="button" aria-current={p === curPage ? "page" : undefined} onClick={() => setPage(p)}>
                    {p}
                  </button>
                ))}
              <button type="button" disabled={curPage === pages} onClick={() => setPage(curPage + 1)} aria-label="次のページ">
                <ChevronRight size={16} />
              </button>
              <span className="spacer" />
              <span className="muted small">
                {(curPage - 1) * PAGE_SIZE + 1}–{Math.min(curPage * PAGE_SIZE, list.length)} / {list.length}件
              </span>
            </div>
          )}
        </section>

        <aside className="card detail no-print">
          <div className="row" style={{ marginBottom: 12 }}>
            <h2>指摘の詳細</h2>
            <span className="spacer" />
            <button type="button" className="btn btn-sm" style={{ border: "none" }} disabled={selIndex <= 0} onClick={() => setSelectedId(list[selIndex - 1].id)}>
              <ChevronLeft size={14} /> 前の指摘
            </button>
            <button
              type="button"
              className="btn btn-sm"
              style={{ border: "none" }}
              disabled={selIndex < 0 || selIndex >= list.length - 1}
              onClick={() => setSelectedId(list[selIndex + 1].id)}
            >
              次の指摘 <ChevronRight size={14} />
            </button>
            <button type="button" className="icon-btn" aria-label="閉じる" onClick={() => setSelectedId(null)}>
              <X size={16} />
            </button>
          </div>
          {selected ? (
            <Detail
              key={selected.id}
              f={selected}
              runId={run.id}
              aiReady={aiReady}
              explaining={busy === `explain:${selected.id}`}
              onStatus={(st) => patchFinding(selected, { status: st })}
              onMemo={(memo) => patchFinding(selected, { memo })}
              onExplain={() => explain(selected)}
            />
          ) : (
            <p className="empty">左の一覧から指摘を選んでください。</p>
          )}

          <div className="section">
            <h3 className="row" style={{ marginBottom: 10 }}>
              <Sparkles size={16} color="var(--ai)" aria-hidden /> AI提案（算定漏れ候補）
            </h3>
            {run.suggestions.length === 0 ? (
              <p className="muted small" style={{ margin: 0 }}>
                {run.demo ? "サンプルデータでは使えません。" : "上の「AIで算定漏れ候補を探す」を押すと、ここに候補が出ます。"}
              </p>
            ) : (
              <div className="table-wrap">
                <table>
                  <thead>
                    <tr>
                      <th>カルテ番号</th>
                      <th>項目名・理由</th>
                      <th className="num">見込み</th>
                      <th />
                    </tr>
                  </thead>
                  <tbody>
                    {run.suggestions.map((sg) => (
                      <tr key={sg.id} style={{ opacity: sg.status === "rejected" ? 0.5 : 1 }}>
                        <td className="mono">{sg.karteNo}</td>
                        <td>
                          <b>{sg.itemName}</b>
                          <div className="muted small">{sg.rationale}</div>
                        </td>
                        <td className="num">{sg.estimatedPoints ? `${sg.estimatedPoints}点` : "—"}</td>
                        <td>
                          {sg.status === "open" ? (
                            <div className="row" style={{ flexWrap: "nowrap", gap: 4 }}>
                              <button type="button" className="btn btn-primary btn-sm" onClick={() => setSuggestion(sg, "accepted")}>
                                採用
                              </button>
                              <button type="button" className="btn btn-sm" onClick={() => setSuggestion(sg, "rejected")}>
                                却下
                              </button>
                            </div>
                          ) : (
                            <button type="button" className="btn btn-sm" onClick={() => setSuggestion(sg, "open")}>
                              {sg.status === "accepted" ? "採用済" : "却下済"}・戻す
                            </button>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
            <p className="muted small" style={{ margin: "8px 0 0" }}>
              AIの提案は参考情報です。採用しても自動では何も変わりません。算定するかは必ずご自身で判断してください。
            </p>
          </div>
        </aside>
      </div>
      {toast.node}
    </>
  );
}

function FindingCard({
  f,
  selected,
  onSelect,
  onStatus,
  onMemo,
}: {
  f: Finding;
  selected: boolean;
  onSelect: () => void;
  onStatus: (s: FindingStatus) => void;
  onMemo: () => void;
}) {
  const stop = (fn: () => void) => (e: React.MouseEvent) => {
    e.stopPropagation();
    fn();
  };
  return (
    <article className={`finding${selected ? " selected" : ""}${f.status !== "open" ? " done" : ""}`} onClick={onSelect}>
      <div className="finding-head">
        <span className={`badge solid ${f.impact}`}>{SHORT[f.impact]}</span>
        <span className={`badge cat-badge-${f.category}`}>{CATEGORY_LABELS[f.category]}</span>
        {f.status !== "open" && <span className="badge neutral">{STATUS_LABELS[f.status]}</span>}
        <span className="amount">{yen(f.amountYen)}</span>
      </div>
      <div className="finding-title">{f.itemName || f.ruleName}</div>
      <div className="meta">
        <span>カルテ番号<b>{f.karteNo || "—"}</b></span>
        <span>レセ番号<b>{receiptLabel(f.receiptNo, f.payer)}</b></span>
        <span>診療日<b>{fmtDate(f.date)}</b></span>
        {f.tooth && <span>部位<b>{f.tooth}</b></span>}
      </div>
      <dl className="kv">
        <dt>理由</dt>
        <dd>{f.reason}</dd>
        <dt>根拠</dt>
        <dd>{f.basis}</dd>
        <dt>直し方</dt>
        <dd>{f.fix}</dd>
      </dl>
      {f.memo && <p className="small" style={{ margin: "0 0 10px" }}>メモ：{f.memo}</p>}
      <div className="row no-print">
        {f.status === "open" ? (
          <>
            <button type="button" className="btn btn-primary btn-sm" onClick={stop(() => onStatus("fixed"))}>
              対応済みにする
            </button>
            <button type="button" className="btn btn-sm" onClick={stop(() => onStatus("ignored"))}>
              問題なし（除外）
            </button>
          </>
        ) : (
          <button type="button" className="btn btn-sm" onClick={stop(() => onStatus("open"))}>
            未対応に戻す
          </button>
        )}
        <button type="button" className="btn btn-sm" onClick={stop(onMemo)}>
          <MessageSquare size={14} aria-hidden /> メモ
        </button>
      </div>
    </article>
  );
}

function Detail({
  f,
  runId,
  aiReady,
  explaining,
  onStatus,
  onMemo,
  onExplain,
}: {
  f: Finding;
  runId: string;
  aiReady: boolean;
  explaining: boolean;
  onStatus: (s: FindingStatus) => void;
  onMemo: (m: string) => void;
  onExplain: () => void;
}) {
  const [memo, setMemo] = useState(f.memo ?? "");
  const dirty = memo !== (f.memo ?? "");
  return (
    <>
      <div className="finding-head">
        <span className={`badge solid ${f.impact}`}>{IMPACT_LABELS[f.impact].replace("リスク", "")}</span>
        <span className={`badge cat-badge-${f.category}`}>{CATEGORY_LABELS[f.category]}</span>
      </div>
      <div className="row" style={{ margin: "8px 0 4px", flexWrap: "nowrap" }}>
        <h2 style={{ fontSize: 18 }}>{f.itemName || f.ruleName}</h2>
        <span className="amount">{yen(f.amountYen)}</span>
      </div>
      <div className="meta">
        <span>カルテ番号<b>{f.karteNo || "—"}</b></span>
        <span>レセ番号<b>{receiptLabel(f.receiptNo, f.payer)}</b></span>
        <span>診療日<b>{fmtDate(f.date)}</b></span>
        {f.tooth && <span>部位<b>{f.tooth}</b></span>}
        <span>点数<b>{f.points.toLocaleString()}点</b></span>
      </div>
      <div className="section">
        <dl className="kv" style={{ margin: 0 }}>
          <dt>理由</dt>
          <dd>{f.reason}</dd>
          <dt>根拠</dt>
          <dd>{f.basis}</dd>
          <dt>直し方</dt>
          <dd>{f.fix}</dd>
          <dt>ルール</dt>
          <dd className="muted">{f.ruleName}</dd>
        </dl>
      </div>
      <div className="section">
        <label className="field">
          <span>対応状況</span>
          <select value={f.status} onChange={(e) => onStatus(e.target.value as FindingStatus)}>
            {(["open", "fixed", "ignored"] as const).map((s) => (
              <option key={s} value={s}>
                {STATUS_LABELS[s]}
              </option>
            ))}
          </select>
        </label>
        <label className="field" style={{ marginTop: 12 }}>
          <span>メモ（院内向け）</span>
          <textarea
            value={memo}
            maxLength={200}
            placeholder="例：Dr確認待ち"
            style={{ minHeight: 70 }}
            onChange={(e) => setMemo(e.target.value)}
          />
        </label>
        <div className="row" style={{ marginTop: 6 }}>
          <span className="muted small">{memo.length}/200</span>
          <span className="spacer" />
          <button type="button" className="btn btn-sm btn-primary" disabled={!dirty} onClick={() => onMemo(memo)}>
            メモを保存
          </button>
        </div>
      </div>
      <div className="section">
        {f.aiExplanation ? (
          <div className="ai-box">
            <div className="ai-title">
              <Sparkles size={15} aria-hidden /> AIによる根拠の説明
            </div>
            {f.aiExplanation}
            <span className="ai-note">判定はルールで行っています。AIは補足です。最終確認は告示・通知の原文で。</span>
          </div>
        ) : null}
        <div className="row" style={{ marginTop: f.aiExplanation ? 10 : 0 }}>
          <button
            type="button"
            className="btn btn-ai btn-sm"
            disabled={!aiReady || explaining}
            title={aiReady ? "" : "設定画面でAI機能をONにしてください"}
            onClick={onExplain}
          >
            <Sparkles size={14} aria-hidden />
            {explaining ? "AIが説明を作成中…" : f.aiExplanation ? "AIで説明し直す" : "AIで根拠を説明"}
          </button>
          <span className="spacer" />
          <a className="btn btn-sm btn-outline" href={`/api/audits/${runId}/csv?finding=${encodeURIComponent(f.id)}`}>
            <Download size={14} aria-hidden /> この指摘をCSVに出力
          </a>
        </div>
        {!aiReady && <p className="muted small" style={{ margin: "6px 0 0" }}>AI機能はOFFです（設定画面で切り替え）。</p>}
      </div>
    </>
  );
}
