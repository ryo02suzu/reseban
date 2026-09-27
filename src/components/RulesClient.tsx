"use client";

import { useMemo, useRef, useState } from "react";
import { ArrowDownUp, ChevronLeft, Lock, Pencil, Plus, PlusCircle, Search, Sparkles, Trash2, Upload } from "lucide-react";
import type { RankingRow, Rule, RuleDraft } from "@/lib/rules/types";
import { CATEGORY_LABELS, CATEGORY_ORDER, IMPACT_LABELS, type CheckCategory } from "@/lib/types";
import { describeRule } from "@/lib/rules/describe";
import { api, errorMessage } from "@/lib/client";
import { RuleFormDialog } from "./RuleForm";
import { useToast } from "./Toast";

type AnyRule = Rule & { origin?: "global" | "clinic" };
type EditableRule = Exclude<Rule, { kind: "official" }>;

const SOURCE_LABELS: Record<Rule["source"], string> = { official: "公式", builtin: "初期", ai: "AI", manual: "手動" };

type Dialog = { mode: "add" } | { mode: "edit"; rule: EditableRule } | { mode: "adopt"; draft: RuleDraft } | null;

/**
 * ルール画面。
 *   mode="clinic"：医院。返戻・査定実績の取込と優先順位、ルールの有効・無効、医院独自ルールの追加
 *   mode="admin" ：運営者。全医院共通のルールの管理と、AIによるルール案の採否
 */
export function RulesClient({
  mode,
  canEdit,
  initialRules,
  initialRanking,
  initialDrafts,
  facilities,
  aiReady,
}: {
  mode: "clinic" | "admin";
  canEdit: boolean;
  initialRules: AnyRule[];
  initialRanking: RankingRow[];
  initialDrafts: RuleDraft[];
  facilities: { code: string; name: string }[];
  aiReady: boolean;
}) {
  const toast = useToast();
  const base = mode === "admin" ? "/api/admin/rules" : "/api/rules";
  const [rules, setRules] = useState(initialRules);
  const [ranking, setRanking] = useState(initialRanking);
  const [drafts, setDrafts] = useState(initialDrafts.filter((d) => d.status === "pending"));
  const [selectedId, setSelectedId] = useState<string | null>(initialRules[0]?.id ?? null);
  const [cat, setCat] = useState<CheckCategory | "all">("all");
  const [src, setSrc] = useState<Rule["source"] | "all">("all");
  const [query, setQuery] = useState("");
  const [dialog, setDialog] = useState<Dialog>(null);
  const [aiText, setAiText] = useState("");
  const [aiTitle, setAiTitle] = useState("");
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

  /** 医院側で中身を編集・削除できるのは医院独自ルールだけ。運営者は公式以外すべて */
  const editable = (r: AnyRule) => canEdit && r.kind !== "official" && (mode === "admin" || r.origin === "clinic");
  const deletable = (r: AnyRule) => editable(r) && r.source !== "builtin";

  const replaceRule = (rule: AnyRule) => setRules((rs) => rs.map((r) => (r.id === rule.id ? { ...r, ...rule } : r)));

  const act = async (key: string, fn: () => Promise<void>) => {
    setBusy(key);
    try {
      await fn();
    } catch (e) {
      toast.show(errorMessage(e));
    } finally {
      setBusy(null);
    }
  };

  const toggle = (r: AnyRule) =>
    act(`toggle:${r.id}`, async () => {
      const { rule } = await api<{ rule: AnyRule }>(`${base}/${r.id}`, { method: "PATCH", json: { enabled: !r.enabled } });
      replaceRule(rule);
    });

  const remove = (r: AnyRule) => {
    if (!confirm(`「${r.name}」を削除しますか？`)) return;
    act("remove", async () => {
      await api(`${base}/${r.id}`, { method: "DELETE" });
      setRules((rs) => rs.filter((x) => x.id !== r.id));
      setSelectedId(null);
    });
  };

  const importCsv = (file?: File) => {
    if (!file) return;
    act("csv", async () => {
      const fd = new FormData();
      fd.append("file", file);
      const res = await api<{ count: number; ranking: RankingRow[] }>("/api/rules/history", { method: "POST", body: fd });
      setRanking(res.ranking);
      toast.show(`${res.count}件の実績を取り込みました`);
    });
  };

  const reprioritize = () =>
    act("prio", async () => {
      const res = await api<{ rules: AnyRule[] }>("/api/rules/reprioritize", { method: "POST" });
      setRules(res.rules);
      toast.show("実績の多い順にルールを並べ替えました");
    });

  const makeDrafts = () =>
    act("ai", async () => {
      const res = await api<{ drafts: RuleDraft[]; errors: string[] }>("/api/admin/drafts", { method: "POST", json: { text: aiText, title: aiTitle } });
      setDrafts((d) => [...res.drafts, ...d]);
      toast.show(
        res.drafts.length
          ? `${res.drafts.length}件のルール案ができました${res.errors.length ? `（${res.errors.length}件は形式不備で除外）` : ""}`
          : "ルールにできる記述が見つかりませんでした",
      );
    });

  const reject = (d: RuleDraft) =>
    act(`reject:${d.id}`, async () => {
      await api(`/api/admin/drafts/${d.id}`, { method: "PATCH", json: { action: "reject" } });
      setDrafts((ds) => ds.filter((x) => x.id !== d.id));
    });

  return (
    <>
      <div className="page-head">
        <div>
          <h1>{mode === "admin" ? "共通ルール" : "ルール"}</h1>
          <p>
            {mode === "admin"
              ? "全医院に配信するルールを管理します。AIのルール案は、採用するまでどの医院にも使われません。"
              : "返戻・査定の実績から優先順位をつけ、ルールを管理できます。"}
          </p>
        </div>
        {canEdit && (
          <div className="actions">
            {mode === "clinic" && (
              <>
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
              </>
            )}
            {mode === "admin" && (
              <button type="button" className="btn btn-outline" onClick={() => aiSection.current?.scrollIntoView({ behavior: "smooth" })}>
                <Sparkles size={18} aria-hidden />
                AIでルール案を作る
              </button>
            )}
            <button type="button" className="btn btn-primary" onClick={() => setDialog({ mode: "add" })}>
              <Plus size={18} aria-hidden />
              ルールを追加
            </button>
          </div>
        )}
      </div>
      {!canEdit && (
        <p className="notice info" style={{ marginBottom: 16 }}>
          ルールの変更は医院の管理者のみできます。
        </p>
      )}

      <div className="grid grid-2">
        {mode === "clinic" ? (
          <section className="card">
            <div className="card-head">
              <div>
                <h2>返戻・査定の実績（優先順位づけ）</h2>
                <p>過去1年の実績をもとに、よく発生する項目を多い順に表示しています。</p>
              </div>
              <span className="spacer" />
              {canEdit && (
                <button type="button" className="btn btn-outline btn-sm" disabled={!ranking.length || busy === "prio"} onClick={reprioritize}>
                  <ArrowDownUp size={14} aria-hidden />
                  この順でルールを並べ替える
                </button>
              )}
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
                              <span className="muted small">対応ルールなし（運営者に追加を依頼できます）</span>
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
        ) : (
          <section className="card" ref={aiSection}>
            <h2>AIでルール案を作る</h2>
            <p className="muted small" style={{ margin: "4px 0 12px" }}>
              改定通知・疑義解釈の本文を貼り付けると、AIがルール案を作成します。採用するまで、どの医院のチェックにも使われません。
            </p>
            <input type="text" value={aiTitle} onChange={(e) => setAiTitle(e.target.value)} placeholder="出典（例：令和8年度改定 疑義解釈その3）" style={{ marginBottom: 8 }} />
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
              title={aiReady ? "" : "AIの接続先（AI_PROVIDER）が設定されていません"}
            >
              <Sparkles size={18} aria-hidden />
              {busy === "ai" ? "AIがルール案を作成中…（数十秒かかります）" : "AIでルール案を作る"}
            </button>
            {!aiReady && <p className="muted small">AIの接続先（環境変数 AI_PROVIDER）が設定されていません。</p>}

            <h3 style={{ margin: "18px 0 10px" }}>AIの提案（{drafts.length}件）</h3>
            {drafts.length === 0 ? (
              <p className="muted small">未処理の提案はありません。</p>
            ) : (
              drafts.map((d) => (
                <div className="proposal" key={d.id}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div className="row">
                      <span className={`badge cat-badge-${d.rule.category}`}>{CATEGORY_LABELS[d.rule.category]}</span>
                      <b>{d.rule.name}</b>
                    </div>
                    <p>{describeRule(d.rule).join("／")}</p>
                    <p>
                      出典：{d.sourceTitle}　AIの根拠：{d.aiRationale}
                    </p>
                  </div>
                  <div className="row" style={{ flexDirection: "column", alignItems: "stretch", gap: 6 }}>
                    <button type="button" className="btn btn-primary btn-sm" onClick={() => setDialog({ mode: "adopt", draft: d })}>
                      確認して採用
                    </button>
                    <button type="button" className="btn btn-sm" disabled={busy === `reject:${d.id}`} onClick={() => reject(d)}>
                      却下
                    </button>
                  </div>
                </div>
              ))
            )}
            <p className="notice" style={{ marginTop: 14, background: "var(--ai-soft)", borderColor: "#ddd5fb" }}>
              採用したルールは「無効」の状態で追加されます。サンプルや実データで確認してから有効にしてください。
            </p>
          </section>
        )}

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
          <div className="table-wrap" style={{ maxHeight: 460, overflowY: "auto" }}>
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
                    <td>
                      {r.name}
                      {mode === "clinic" && r.origin === "clinic" && (
                        <span className="badge neutral" style={{ marginLeft: 6 }}>
                          医院独自
                        </span>
                      )}
                    </td>
                    <td className="num">{r.historyCount ?? "—"}</td>
                    <td>{SOURCE_LABELS[r.source]}</td>
                    <td onClick={(e) => e.stopPropagation()}>
                      <input
                        type="checkbox"
                        className="toggle"
                        checked={r.enabled}
                        disabled={!canEdit || busy === `toggle:${r.id}`}
                        onChange={() => toggle(r)}
                        aria-label={`${r.name}を有効にする`}
                      />
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
        <section className="card" style={{ gridColumn: "1 / -1" }}>
          <h2 style={{ marginBottom: 12 }}>ルールの詳細</h2>
          {selected ? (
            <>
              <button type="button" className="btn btn-sm" onClick={() => setSelectedId(null)}>
                <ChevronLeft size={14} aria-hidden /> 閉じる
              </button>
              <div className="row" style={{ margin: "14px 0 6px" }}>
                <span className={`badge cat-badge-${selected.category}`}>{CATEGORY_LABELS[selected.category]}</span>
                <h2>{selected.name}</h2>
                <span className="spacer" />
                <span className="muted small">有効</span>
                <input type="checkbox" className="toggle" checked={selected.enabled} disabled={!canEdit} onChange={() => toggle(selected)} aria-label="有効" />
              </div>
              <div className="meta">
                <span>優先順位<b>{selected.priority}</b></span>
                <span>過去1年の該当件数<b>{selected.historyCount ?? "—"}件</b></span>
                <span>出どころ<b>{SOURCE_LABELS[selected.source]}</b></span>
                <span>扱い<b>{IMPACT_LABELS[selected.impact]}</b></span>
                {mode === "clinic" && <span>種類<b>{selected.origin === "clinic" ? "医院独自" : "共通（運営者が管理）"}</b></span>}
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
              {selected.note && (
                <p className="notice" style={{ margin: "0 0 14px" }}>
                  {selected.note}
                </p>
              )}
              <div className="row">
                {editable(selected) && selected.kind !== "official" && (
                  <button type="button" className="btn" onClick={() => setDialog({ mode: "edit", rule: selected as EditableRule })}>
                    <Pencil size={16} aria-hidden /> 編集する
                  </button>
                )}
                {deletable(selected) ? (
                  <button type="button" className="btn btn-danger" onClick={() => remove(selected)}>
                    <Trash2 size={16} aria-hidden /> 削除する
                  </button>
                ) : (
                  <span className="muted small row" style={{ gap: 4 }}>
                    <Lock size={14} aria-hidden />
                    {selected.kind === "official"
                      ? "公式テーブルのルールは中身を編集できません（有効・無効の切り替えのみ）"
                      : mode === "clinic" && selected.origin !== "clinic"
                        ? "共通ルールは運営者が管理しています（有効・無効は医院ごとに切り替えられます）"
                        : "初期ルールは削除できません（無効にはできます）"}
                  </span>
                )}
              </div>
            </>
          ) : (
            <p className="empty">一覧からルールを選ぶと、ここに条件・根拠・直し方が出ます。</p>
          )}
          {canEdit && (
            <div className="add-box">
              <PlusCircle size={22} color="var(--primary)" aria-hidden />
              <div style={{ flex: 1 }}>
                <b>手動でルールを追加</b>
                <div className="muted small">
                  {mode === "admin" ? "全医院に配信されます（追加直後から有効）。" : "この医院だけで使われるルールです。"}
                </div>
              </div>
              <button type="button" className="btn btn-outline btn-sm" onClick={() => setDialog({ mode: "add" })}>
                <Plus size={14} aria-hidden /> ルールを追加
              </button>
            </div>
          )}
        </section>
      </div>

      <RuleFormDialog
        open={dialog !== null}
        title={dialog?.mode === "edit" ? "ルールを編集" : dialog?.mode === "adopt" ? "AIのルール案を確認して採用（無効の状態で追加）" : "ルールを追加"}
        submitLabel={dialog?.mode === "adopt" ? "この内容で採用" : "保存"}
        initial={dialog?.mode === "edit" ? dialog.rule : dialog?.mode === "adopt" ? (dialog.draft.rule as EditableRule) : undefined}
        facilities={facilities}
        onClose={() => setDialog(null)}
        onSubmit={async (raw) => {
          if (dialog?.mode === "edit") {
            const { rule } = await api<{ rule: AnyRule }>(`${base}/${dialog.rule.id}`, { method: "PATCH", json: { ...raw, enabled: dialog.rule.enabled } });
            replaceRule(rule);
            toast.show("保存しました");
          } else if (dialog?.mode === "adopt") {
            const { rule } = await api<{ rule: AnyRule }>(`/api/admin/drafts/${dialog.draft.id}`, { method: "PATCH", json: { action: "adopt", rule: raw } });
            setDrafts((ds) => ds.filter((x) => x.id !== dialog.draft.id));
            setRules((rs) => [...rs, rule]);
            setSelectedId(rule.id);
            toast.show("採用しました（無効の状態です。確認後に有効にしてください）");
          } else {
            const { rule } = await api<{ rule: AnyRule }>(base, { method: "POST", json: raw });
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
