"use client";

import { useMemo, useRef, useState } from "react";
import { ArrowDownUp, ChevronLeft, Lock, Pencil, Plus, PlusCircle, Search, Sparkles, Trash2, Upload } from "lucide-react";
import type { RankingRow, Rule, RuleDraft } from "@/lib/rules/types";
import { CATEGORY_LABELS, CATEGORY_ORDER, IMPACT_LABELS, type CheckCategory } from "@/lib/types";
import { describeRule } from "@/lib/rules/describe";
import { api, errorMessage } from "@/lib/client";
import { RuleFormDialog } from "./RuleForm";
import { useToast } from "./Toast";

const SOURCE_LABELS: Record<Rule["source"], string> = { builtin: "初期", ai: "AI", manual: "手動" };

type Dialog = { mode: "add" } | { mode: "edit"; rule: Rule } | { mode: "adopt"; draft: RuleDraft } | null;

export function RulesClient({
  initialRules,
  initialRanking,
  initialDrafts,
  standards,
  aiReady,
}: {
  initialRules: Rule[];
  initialRanking: RankingRow[];
  initialDrafts: RuleDraft[];
  standards: string[];
  aiReady: boolean;
}) {
  const toast = useToast();
  const [rules, setRules] = useState(initialRules);
  const [ranking, setRanking] = useState(initialRanking);
  const [drafts, setDrafts] = useState(initialDrafts);
  const [selectedId, setSelectedId] = useState<string | null>(initialRules[0]?.id ?? null);
  const [cat, setCat] = useState<CheckCategory | "all">("all");
  const [src, setSrc] = useState<Rule["source"] | "all">("all");
  const [query, setQuery] = useState("");
  const [dialog, setDialog] = useState<Dialog>(null);
  const [aiText, setAiText] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const csvInput = useRef<HTMLInputElement>(null);
  const aiSection = useRef<HTMLElement>(null);

  const selected = rules.find((r) => r.id === selectedId) ?? null;
  const filtered = useMemo(() => {
    const q = query.trim();
    return rules.filter(
      (r) =>
        (cat === "all" || r.category === cat) &&
        (src === "all" || r.source === src) &&
        (!q || r.name.includes(q) || describeRule(r).join("").includes(q)),
    );
  }, [rules, cat, src, query]);

  const replaceRule = (rule: Rule) => setRules((rs) => rs.map((r) => (r.id === rule.id ? rule : r)));

  const toggle = async (r: Rule) => {
    try {
      const { rule } = await api<{ rule: Rule }>(`/api/rules/${r.id}`, { method: "PATCH", json: { enabled: !r.enabled } });
      replaceRule(rule);
    } catch (e) {
      toast.show(errorMessage(e));
    }
  };

  const remove = async (r: Rule) => {
    if (!confirm(`「${r.name}」を削除しますか？`)) return;
    try {
      await api(`/api/rules/${r.id}`, { method: "DELETE" });
      setRules((rs) => rs.filter((x) => x.id !== r.id));
      setSelectedId(null);
    } catch (e) {
      toast.show(errorMessage(e));
    }
  };

  const importCsv = async (file?: File) => {
    if (!file) return;
    setBusy("csv");
    try {
      const fd = new FormData();
      fd.append("file", file);
      const res = await api<{ count: number; ranking: RankingRow[] }>("/api/rules/history", { method: "POST", body: fd });
      setRanking(res.ranking);
      toast.show(`${res.count}件の実績を取り込みました`);
    } catch (e) {
      toast.show(errorMessage(e));
    } finally {
      setBusy(null);
    }
  };

  const reprioritize = async () => {
    setBusy("prio");
    try {
      const res = await api<{ rules: Rule[] }>("/api/rules/reprioritize", { method: "POST" });
      setRules(res.rules);
      toast.show("実績の多い順にルールを並べ替えました");
    } catch (e) {
      toast.show(errorMessage(e));
    } finally {
      setBusy(null);
    }
  };

  const makeDrafts = async () => {
    setBusy("ai");
    try {
      const res = await api<{ drafts: RuleDraft[]; errors: string[] }>("/api/rules/drafts", { method: "POST", json: { text: aiText } });
      setDrafts((d) => [...res.drafts, ...d]);
      toast.show(
        res.drafts.length
          ? `${res.drafts.length}件のルール案ができました${res.errors.length ? `（${res.errors.length}件は形式不備で除外）` : ""}`
          : "ルールにできる記述が見つかりませんでした",
      );
    } catch (e) {
      toast.show(errorMessage(e));
    } finally {
      setBusy(null);
    }
  };

  const decide = async (d: RuleDraft, action: "adopt" | "reject", rule?: Record<string, unknown>) => {
    const res = await api<{ rule?: Rule }>(`/api/rules/drafts/${d.id}`, { method: "PATCH", json: { action, rule } });
    setDrafts((ds) => ds.filter((x) => x.id !== d.id));
    if (res.rule) {
      setRules((rs) => [...rs, res.rule!]);
      toast.show("ルールに追加しました。次回のチェックから使われます");
    }
  };

  return (
    <>
      <div className="page-head">
        <div>
          <h1>ルール</h1>
          <p>返戻・査定の実績から優先順位をつけ、ルールを管理できます。</p>
        </div>
        <div className="actions">
          <button type="button" className="btn btn-outline" disabled={busy === "csv"} onClick={() => csvInput.current?.click()}>
            <Upload size={18} aria-hidden />
            {busy === "csv" ? "取り込み中…" : "実績CSVを取り込む"}
          </button>
          <input
            ref={csvInput}
            type="file"
            accept=".csv,.txt"
            hidden
            onChange={(e) => {
              importCsv(e.target.files?.[0]);
              e.target.value = "";
            }}
          />
          <button type="button" className="btn btn-outline" onClick={() => aiSection.current?.scrollIntoView({ behavior: "smooth" })}>
            <Sparkles size={18} aria-hidden />
            AIでルール案を作る
          </button>
          <button type="button" className="btn btn-primary" onClick={() => setDialog({ mode: "add" })}>
            <Plus size={18} aria-hidden />
            ルールを追加
          </button>
        </div>
      </div>

      <div className="grid grid-2">
        {/* 実績ランキング */}
        <section className="card">
          <div className="card-head">
            <div>
              <h2>返戻・査定の実績（優先順位づけ）</h2>
              <p>過去1年の実績をもとに、よく発生する項目を多い順に表示しています。</p>
            </div>
            <span className="spacer" />
            <button type="button" className="btn btn-outline btn-sm" disabled={!ranking.length || busy === "prio"} onClick={reprioritize}>
              <ArrowDownUp size={14} aria-hidden />
              この順でルールを並べ替える
            </button>
          </div>
          {ranking.length === 0 ? (
            <div className="empty">
              まだ実績がありません。「実績CSVを取り込む」から読み込んでください。
              <div className="small" style={{ marginTop: 8 }}>
                CSVの列：年月, 返戻/査定, 項目名, 事由, 点数（1行目は見出しでも可）
              </div>
            </div>
          ) : (
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>順位</th>
                    <th>項目名</th>
                    <th className="num">件数</th>
                    <th className="num">点数</th>
                    <th>対応ルール</th>
                  </tr>
                </thead>
                <tbody>
                  {ranking.slice(0, 30).map((row, i) => {
                    const rule = rules.find((r) => r.id === row.ruleId);
                    return (
                      <tr key={row.label}>
                        <td>{i + 1}</td>
                        <td>{row.label}</td>
                        <td className="num">{row.count}</td>
                        <td className="num">{row.points.toLocaleString()}点</td>
                        <td>
                          {rule ? (
                            <button type="button" className="btn btn-outline btn-sm" onClick={() => setSelectedId(rule.id)}>
                              {rule.name}
                            </button>
                          ) : (
                            <span className="muted small">対応ルールなし</span>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </section>

        {/* ルール一覧 */}
        <section className="card">
          <h2 style={{ marginBottom: 14 }}>ルール一覧</h2>
          <div className="row" style={{ marginBottom: 12, flexWrap: "nowrap" }}>
            <select value={cat} onChange={(e) => setCat(e.target.value as CheckCategory | "all")} style={{ width: 170 }}>
              <option value="all">すべてのカテゴリ</option>
              {CATEGORY_ORDER.map((c) => (
                <option key={c} value={c}>
                  {CATEGORY_LABELS[c]}
                </option>
              ))}
            </select>
            <select value={src} onChange={(e) => setSrc(e.target.value as Rule["source"] | "all")} style={{ width: 150 }}>
              <option value="all">すべての出どころ</option>
              {(Object.keys(SOURCE_LABELS) as Rule["source"][]).map((s) => (
                <option key={s} value={s}>
                  {SOURCE_LABELS[s]}
                </option>
              ))}
            </select>
            <div className="search" style={{ flex: 1 }}>
              <Search size={16} aria-hidden />
              <input type="search" placeholder="ルール名・キーワードで検索" value={query} onChange={(e) => setQuery(e.target.value)} />
            </div>
          </div>
          <div className="table-wrap" style={{ maxHeight: 420, overflowY: "auto" }}>
            <table>
              <thead>
                <tr>
                  <th>優先</th>
                  <th>カテゴリ</th>
                  <th>ルール名</th>
                  <th className="num">過去1年</th>
                  <th>出どころ</th>
                  <th>有効</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((r) => (
                  <tr key={r.id} className={`clickable${r.id === selectedId ? " selected" : ""}`} onClick={() => setSelectedId(r.id)}>
                    <td>{r.priority}</td>
                    <td>
                      <span className={`badge cat-badge-${r.category}`}>{CATEGORY_LABELS[r.category]}</span>
                    </td>
                    <td>{r.name}</td>
                    <td className="num">{r.historyCount ?? "—"}</td>
                    <td>{SOURCE_LABELS[r.source]}</td>
                    <td onClick={(e) => e.stopPropagation()}>
                      <input type="checkbox" className="toggle" checked={r.enabled} onChange={() => toggle(r)} aria-label={`${r.name}を有効にする`} />
                    </td>
                  </tr>
                ))}
                {filtered.length === 0 && (
                  <tr>
                    <td colSpan={6} className="empty">
                      該当するルールがありません
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </section>

        {/* ルールの詳細 */}
        <section className="card">
          <h2 style={{ marginBottom: 12 }}>ルールの詳細</h2>
          {selected ? (
            <>
              <button type="button" className="btn btn-sm" onClick={() => setSelectedId(null)}>
                <ChevronLeft size={14} aria-hidden /> 戻る
              </button>
              <div className="row" style={{ margin: "14px 0 6px" }}>
                <span className={`badge cat-badge-${selected.category}`}>{CATEGORY_LABELS[selected.category]}</span>
                <h2>{selected.name}</h2>
                <span className="spacer" />
                <span className="muted small">有効</span>
                <input type="checkbox" className="toggle" checked={selected.enabled} onChange={() => toggle(selected)} aria-label="有効" />
              </div>
              <div className="meta">
                <span>優先順位<b>{selected.priority}</b></span>
                <span>過去1年の該当件数<b>{selected.historyCount ?? "—"}件</b></span>
                <span>出どころ<b>{SOURCE_LABELS[selected.source]}</b></span>
                <span>扱い<b>{IMPACT_LABELS[selected.impact]}</b></span>
              </div>
              <div className="cond-grid">
                <div className="cond-box">
                  <h3>条件</h3>
                  <ul>
                    {describeRule(selected).map((l) => (
                      <li key={l}>{l}</li>
                    ))}
                  </ul>
                </div>
                <div className="cond-box">
                  <h3>根拠</h3>
                  <div>{selected.basis}</div>
                </div>
                <div className="cond-box">
                  <h3>直し方</h3>
                  <div>{selected.fix}</div>
                </div>
              </div>
              {selected.note && <p className="notice" style={{ margin: "0 0 14px" }}>{selected.note}</p>}
              <div className="row">
                <button type="button" className="btn" onClick={() => setDialog({ mode: "edit", rule: selected })}>
                  <Pencil size={16} aria-hidden /> 編集する
                </button>
                {selected.source === "builtin" ? (
                  <span className="muted small row" style={{ gap: 4 }}>
                    <Lock size={14} aria-hidden /> 初期ルールは削除できません（無効にはできます）
                  </span>
                ) : (
                  <button type="button" className="btn btn-danger" onClick={() => remove(selected)}>
                    <Trash2 size={16} aria-hidden /> 削除する
                  </button>
                )}
              </div>
            </>
          ) : (
            <p className="empty">一覧からルールを選ぶと、ここに条件・根拠・直し方が出ます。</p>
          )}
          <div className="add-box">
            <PlusCircle size={22} color="var(--primary)" aria-hidden />
            <div style={{ flex: 1 }}>
              <b>手動でルールを追加</b>
              <div className="muted small">独自のルールを追加できます。追加後は、ルール一覧に表示されます。</div>
            </div>
            <button type="button" className="btn btn-outline btn-sm" onClick={() => setDialog({ mode: "add" })}>
              <Plus size={14} aria-hidden /> ルールを追加
            </button>
          </div>
        </section>

        {/* AI ルール案 */}
        <section className="card" ref={aiSection}>
          <h2>AIでルール案を作る</h2>
          <p className="muted small" style={{ margin: "4px 0 12px" }}>
            改定通知・疑義解釈の本文を貼り付けると、AIがルール案を作成します。採用するまでチェックには使われません。
          </p>
          <textarea
            value={aiText}
            maxLength={20000}
            onChange={(e) => setAiText(e.target.value)}
            placeholder={"例）\n・令和8年度診療報酬改定に関する疑義解釈の本文\n・特定の項目に関する通知文　など"}
          />
          <div className="muted small" style={{ textAlign: "right" }}>
            {aiText.length.toLocaleString()} / 20,000
          </div>
          <button
            type="button"
            className="btn btn-primary btn-block"
            style={{ marginTop: 8 }}
            disabled={!aiReady || !aiText.trim() || busy === "ai"}
            onClick={makeDrafts}
            title={aiReady ? "" : "設定画面でAI機能をONにしてください"}
          >
            <Sparkles size={18} aria-hidden />
            {busy === "ai" ? "AIがルール案を作成中…（数十秒かかります）" : "AIでルール案を作る"}
          </button>
          {!aiReady && <p className="muted small">AI機能はOFFです（設定画面で切り替え）。</p>}

          <h3 style={{ margin: "18px 0 10px" }}>AIの提案（{drafts.length}件）</h3>
          {drafts.length === 0 ? (
            <p className="muted small">まだ提案はありません。</p>
          ) : (
            drafts.map((d) => (
              <div className="proposal" key={d.id}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div className="row">
                    <span className={`badge cat-badge-${d.rule.category}`}>{CATEGORY_LABELS[d.rule.category]}</span>
                    <b>{d.rule.name}</b>
                  </div>
                  <p>{describeRule(d.rule).join("／")}</p>
                  <p>AIの根拠：{d.aiRationale}</p>
                </div>
                <div className="row" style={{ flexDirection: "column", alignItems: "stretch", gap: 6 }}>
                  <button type="button" className="btn btn-primary btn-sm" onClick={() => setDialog({ mode: "adopt", draft: d })}>
                    確認して採用
                  </button>
                  <button
                    type="button"
                    className="btn btn-sm"
                    onClick={() => decide(d, "reject").catch((e) => toast.show(errorMessage(e)))}
                  >
                    却下
                  </button>
                </div>
              </div>
            ))
          )}
          <p className="notice" style={{ marginTop: 14, background: "var(--ai-soft)", borderColor: "#ddd5fb" }}>
            AIの提案は参考情報です。採用する前に、必ず原文と照らし合わせてください。
          </p>
        </section>
      </div>

      <RuleFormDialog
        open={dialog !== null}
        title={dialog?.mode === "edit" ? "ルールを編集" : dialog?.mode === "adopt" ? "AIのルール案を確認して採用" : "ルールを追加"}
        submitLabel={dialog?.mode === "adopt" ? "この内容で採用" : "保存"}
        initial={dialog?.mode === "edit" ? dialog.rule : dialog?.mode === "adopt" ? dialog.draft.rule : undefined}
        standards={standards}
        onClose={() => setDialog(null)}
        onSubmit={async (raw) => {
          if (dialog?.mode === "edit") {
            const { rule } = await api<{ rule: Rule }>(`/api/rules/${dialog.rule.id}`, { method: "PATCH", json: { ...raw, enabled: dialog.rule.enabled } });
            replaceRule(rule);
            toast.show("保存しました");
          } else if (dialog?.mode === "adopt") {
            await decide(dialog.draft, "adopt", raw);
          } else {
            const { rule } = await api<{ rule: Rule }>("/api/rules", { method: "POST", json: raw });
            setRules((rs) => [...rs, rule]);
            setSelectedId(rule.id);
            toast.show("ルールを追加しました");
          }
          setDialog(null);
        }}
      />
      {toast.node}
    </>
  );
}
