"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { ClipboardCheck, FilePlus2, Pencil, Play, Plus, Save, Trash2, X } from "lucide-react";
import { api, errorMessage } from "@/lib/client";
import { formatMonth } from "@/lib/format";
import { emptyPaper, parseDays, type PaperAct, type PaperDiagnosis, type PaperReceipt, type PaperReceiptInput } from "@/lib/paper/types";
import { parseTeethInput, teethLabel } from "@/lib/teeth";
import { CATEGORY_LABELS, IMPACT_LABELS, type Finding } from "@/lib/types";

interface Suggest {
  code: string;
  name: string;
  sub?: string;
}

const toInputMonth = (ym: string) => `${ym.slice(0, 4)}-${ym.slice(4, 6)}`;
const fromInputMonth = (v: string) => v.replace("-", "");

/** マスターの候補を出す（入力が止まってから検索） */
function useSuggest(type: "act" | "diag") {
  const [items, setItems] = useState<Suggest[]>([]);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const search = (q: string) => {
    clearTimeout(timer.current);
    if (!q.trim()) return;
    timer.current = setTimeout(async () => {
      try {
        const r = await api<{ items: Suggest[] }>(`/api/master/search?type=${type}&q=${encodeURIComponent(q)}`);
        setItems(r.items);
      } catch {
        /* 候補が出ないだけなので無視 */
      }
    }, 250);
  };
  return { items, search };
}

function TeethHint({ value }: { value: string }) {
  if (!value.trim()) return null;
  const { codes, bad } = parseTeethInput(value);
  if (bad.length) return <span className="small" style={{ color: "var(--henrei)" }}>読めません：{bad.join("、")}</span>;
  return <span className="muted small">→ {teethLabel(codes)}</span>;
}

function DaysHint({ value }: { value: string }) {
  if (!value.trim()) return null;
  const { bad } = parseDays(value);
  return bad.length ? <span className="small" style={{ color: "var(--henrei)" }}>読めません：{bad.join("、")}</span> : null;
}

export function PaperClient({
  initialMonth,
  initialReceipts,
  initialMonths,
  demo,
}: {
  initialMonth: string;
  initialReceipts: PaperReceipt[];
  initialMonths: { month: string; count: number }[];
  demo: boolean;
}) {
  const router = useRouter();
  const [month, setMonth] = useState(initialMonth);
  const [receipts, setReceipts] = useState(initialReceipts);
  const [months, setMonths] = useState(initialMonths);
  const [editing, setEditing] = useState<{ id?: string; value: PaperReceiptInput } | null>(null);
  const [preview, setPreview] = useState<{ findings: Finding[]; notes: string[] } | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string>();
  const acts = useSuggest("act");
  const diags = useSuggest("diag");
  const formRef = useRef<HTMLDivElement>(null);

  const load = async (m: string) => {
    setError(undefined);
    try {
      const r = await api<{ receipts: PaperReceipt[]; months: { month: string; count: number }[] }>(`/api/paper?month=${m}`);
      setReceipts(r.receipts);
      setMonths(r.months);
    } catch (e) {
      setError(errorMessage(e));
    }
  };

  const changeMonth = (m: string) => {
    if (!/^\d{6}$/.test(m)) return;
    setMonth(m);
    setEditing(null);
    setPreview(null);
    load(m);
  };

  useEffect(() => {
    if (editing) formRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  }, [editing?.id, !!editing]); // eslint-disable-line react-hooks/exhaustive-deps

  const open = (p?: PaperReceipt) => {
    setPreview(null);
    setError(undefined);
    if (!p) return setEditing({ value: emptyPaper(month) });
    const value: PaperReceiptInput = { month: p.month, patientId: p.patientId, sex: p.sex, age: p.age, diagnoses: p.diagnoses, acts: p.acts, memo: p.memo };
    setEditing({
      id: p.id,
      value: {
        ...value,
        diagnoses: value.diagnoses.length ? value.diagnoses : [{ teeth: "", name: "" }],
        acts: value.acts.length ? value.acts : [{ days: "", name: "", teeth: "", comment: "" }],
      },
    });
  };

  const set = (patch: Partial<PaperReceiptInput>) => setEditing((e) => (e ? { ...e, value: { ...e.value, ...patch } } : e));
  const setDiag = (i: number, patch: Partial<PaperDiagnosis>) =>
    set({ diagnoses: editing!.value.diagnoses.map((d, j) => (j === i ? { ...d, ...patch } : d)) });
  const setAct = (i: number, patch: Partial<PaperAct>) => set({ acts: editing!.value.acts.map((a, j) => (j === i ? { ...a, ...patch } : a)) });

  const check = async () => {
    if (!editing) return;
    setBusy("preview");
    setError(undefined);
    try {
      setPreview(await api("/api/paper/preview", { method: "POST", json: editing.value }));
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(null);
    }
  };

  const save = async () => {
    if (!editing) return;
    setBusy("save");
    setError(undefined);
    try {
      const saved = editing.id
        ? await api<PaperReceipt>(`/api/paper/${editing.id}`, { method: "PUT", json: editing.value })
        : await api<PaperReceipt>("/api/paper", { method: "POST", json: editing.value });
      setEditing(null);
      setPreview(null);
      if (saved.month !== month) setMonth(saved.month);
      await load(saved.month);
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(null);
    }
  };

  const remove = async (p: PaperReceipt) => {
    if (!confirm(`No.${p.no}（患者ID ${p.patientId}）を削除しますか？`)) return;
    try {
      await api(`/api/paper/${p.id}`, { method: "DELETE" });
      await load(month);
      if (editing?.id === p.id) setEditing(null);
    } catch (e) {
      setError(errorMessage(e));
    }
  };

  const runMonth = async () => {
    setBusy("run");
    setError(undefined);
    try {
      const { id } = await api<{ id: string }>("/api/paper/check", { method: "POST", json: { month } });
      router.push(`/report/${id}`);
    } catch (e) {
      setError(errorMessage(e));
      setBusy(null);
    }
  };

  const v = editing?.value;

  return (
    <>
      <div className="page-head">
        <div>
          <h1>紙レセプト入力</h1>
          <p>紙のレセプトを1枚ずつ入力して、レセ電と同じルールでチェックします。氏名・保険証番号は入力しません。</p>
        </div>
      </div>

      {demo && (
        <p className="notice info">
          デモ環境です。入力フォームと「この1枚をチェック」は試せますが、保存はできません。実在の患者の情報は入力しないでください。
        </p>
      )}
      {error && (
        <p className="notice error" role="alert">
          {error}
        </p>
      )}

      <section className="card">
        <div className="row" style={{ alignItems: "flex-end", gap: 16 }}>
          <label className="field" style={{ margin: 0 }}>
            <span>診療月</span>
            <input type="month" value={toInputMonth(month)} onChange={(e) => changeMonth(fromInputMonth(e.target.value))} />
          </label>
          <div className="muted small" style={{ paddingBottom: 8 }}>
            {formatMonth(month)}：{receipts.length}枚
          </div>
          <span className="spacer" />
          <button type="button" className="btn btn-outline" onClick={() => open()}>
            <FilePlus2 size={18} aria-hidden />
            新しく入力
          </button>
          <button type="button" className="btn btn-primary" disabled={!receipts.length || !!busy} onClick={runMonth}>
            <Play size={18} fill="currentColor" aria-hidden />
            {busy === "run" ? "チェック中…" : "この月をまとめてチェック"}
          </button>
        </div>
        {months.length > 0 && (
          <div className="file-chips">
            {months.map((m) => (
              <button type="button" key={m.month} className={`file-chip${m.month === month ? " active" : ""}`} onClick={() => changeMonth(m.month)}>
                {formatMonth(m.month)}・{m.count}枚
              </button>
            ))}
          </div>
        )}

        <div className="table-wrap" style={{ marginTop: 16 }}>
          {receipts.length === 0 ? (
            <p className="empty">この月はまだ入力されていません。「新しく入力」から始めてください。</p>
          ) : (
            <table>
              <thead>
                <tr>
                  <th className="num" style={{ width: 60 }}>
                    No.
                  </th>
                  <th>患者ID</th>
                  <th>性別・年齢</th>
                  <th>傷病名</th>
                  <th>診療行為</th>
                  <th style={{ width: 110 }}>操作</th>
                </tr>
              </thead>
              <tbody>
                {receipts.map((p) => (
                  <tr key={p.id} className={editing?.id === p.id ? "selected" : undefined}>
                    <td className="num">{p.no}</td>
                    <td>{p.patientId}</td>
                    <td className="muted">
                      {p.sex === "1" ? "男" : p.sex === "2" ? "女" : "—"}・{p.age ?? "—"}歳
                    </td>
                    <td>{p.diagnoses.map((d) => `${d.teeth ? `${d.teeth} ` : ""}${d.name}`).join("、") || "—"}</td>
                    <td className="muted">{p.acts.map((a) => a.name).join("、")}</td>
                    <td>
                      <div className="row" style={{ flexWrap: "nowrap" }}>
                        <button type="button" className="icon-btn" aria-label="編集" onClick={() => open(p)}>
                          <Pencil size={17} />
                        </button>
                        <button type="button" className="icon-btn danger" aria-label="削除" onClick={() => remove(p)} disabled={demo}>
                          <Trash2 size={17} />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </section>

      {v && (
        <section className="card" style={{ marginTop: 20 }} ref={formRef}>
          <div className="card-head">
            <ClipboardCheck className="icon" size={22} aria-hidden />
            <h2>{editing?.id ? "紙レセプトを直す" : "紙レセプトを入力"}</h2>
            <span className="spacer" />
            <button type="button" className="icon-btn" aria-label="閉じる" onClick={() => setEditing(null)}>
              <X size={18} />
            </button>
          </div>

          <div className="paper-top">
            <label className="field">
              <span>診療年月</span>
              <input type="month" value={toInputMonth(v.month)} onChange={(e) => set({ month: fromInputMonth(e.target.value) })} />
            </label>
            <label className="field">
              <span>患者ID（カルテ番号など）</span>
              <input type="text" value={v.patientId} onChange={(e) => set({ patientId: e.target.value })} placeholder="例：1234" />
            </label>
            <label className="field">
              <span>性別</span>
              <select value={v.sex} onChange={(e) => set({ sex: e.target.value as PaperReceiptInput["sex"] })}>
                <option value="">—</option>
                <option value="1">男</option>
                <option value="2">女</option>
              </select>
            </label>
            <label className="field">
              <span>年齢</span>
              <input
                type="number"
                min={0}
                max={120}
                value={v.age ?? ""}
                onChange={(e) => set({ age: e.target.value === "" ? null : Number(e.target.value) })}
                placeholder="例：45"
              />
            </label>
          </div>
          <p className="muted small" style={{ margin: "4px 0 0" }}>
            氏名・保険証の番号・生年月日は入力しないでください。患者IDは、月をまたいだ回数や前提検査の点検に使います（毎月同じIDで）。
          </p>

          <h3 className="paper-h">傷病名</h3>
          <datalist id="diag-suggest">
            {diags.items.map((d) => (
              <option key={d.code} value={d.name}>
                {d.sub}
              </option>
            ))}
          </datalist>
          <div className="paper-rows">
            <div className="paper-row diag head">
              <span>部位</span>
              <span>傷病名（略称でも可：C、Pul、Per、P など）</span>
              <span />
            </div>
            {v.diagnoses.map((d, i) => (
              <div className="paper-row diag" key={i}>
                <div>
                  <input type="text" value={d.teeth} onChange={(e) => setDiag(i, { teeth: e.target.value })} placeholder="右下6、46、上顎" aria-label="部位" />
                  <TeethHint value={d.teeth} />
                </div>
                <input
                  type="text"
                  list="diag-suggest"
                  value={d.name}
                  onChange={(e) => {
                    setDiag(i, { name: e.target.value });
                    diags.search(e.target.value);
                  }}
                  placeholder="例：Pul"
                  aria-label="傷病名"
                />
                <button type="button" className="icon-btn" aria-label="この行を消す" onClick={() => set({ diagnoses: v.diagnoses.filter((_, j) => j !== i) })}>
                  <X size={16} />
                </button>
              </div>
            ))}
          </div>
          <button type="button" className="btn btn-sm btn-outline" onClick={() => set({ diagnoses: [...v.diagnoses, { teeth: "", name: "" }] })}>
            <Plus size={16} aria-hidden />
            傷病名を追加
          </button>

          <h3 className="paper-h">診療行為</h3>
          <datalist id="act-suggest">
            {acts.items.map((a) => (
              <option key={a.code} value={a.name}>
                {a.sub}
              </option>
            ))}
          </datalist>
          <div className="paper-rows">
            <div className="paper-row act head">
              <span>算定日</span>
              <span>項目（候補から選ぶと正確です）</span>
              <span>回数</span>
              <span>部位</span>
              <span>コメント</span>
              <span />
            </div>
            {v.acts.map((a, i) => (
              <div className="paper-row act" key={i}>
                <div>
                  <input type="text" value={a.days} onChange={(e) => setAct(i, { days: e.target.value })} placeholder="3,10" aria-label="算定日" />
                  <DaysHint value={a.days} />
                </div>
                <div>
                  <input
                    type="text"
                    list="act-suggest"
                    value={a.name}
                    onChange={(e) => {
                      const hit = acts.items.find((x) => x.name === e.target.value);
                      setAct(i, { name: e.target.value, code: hit?.code });
                      if (!hit) acts.search(e.target.value);
                    }}
                    placeholder="例：再診、抜髄"
                    aria-label="項目"
                  />
                  {a.code && <span className="muted small">コード {a.code}</span>}
                </div>
                <input
                  type="number"
                  min={1}
                  value={a.count ?? ""}
                  onChange={(e) => setAct(i, { count: e.target.value === "" ? undefined : Number(e.target.value) })}
                  placeholder="自動"
                  aria-label="回数"
                />
                <div>
                  <input type="text" value={a.teeth} onChange={(e) => setAct(i, { teeth: e.target.value })} placeholder="右下6" aria-label="部位" />
                  <TeethHint value={a.teeth} />
                </div>
                <input type="text" value={a.comment} onChange={(e) => setAct(i, { comment: e.target.value })} placeholder="摘要のコメント" aria-label="コメント" />
                <button type="button" className="icon-btn" aria-label="この行を消す" onClick={() => set({ acts: v.acts.filter((_, j) => j !== i) })}>
                  <X size={16} />
                </button>
              </div>
            ))}
          </div>
          <button type="button" className="btn btn-sm btn-outline" onClick={() => set({ acts: [...v.acts, { days: "", name: "", teeth: "", comment: "" }] })}>
            <Plus size={16} aria-hidden />
            診療行為を追加
          </button>

          <label className="field" style={{ marginTop: 16 }}>
            <span>メモ（任意）</span>
            <textarea rows={2} value={v.memo} onChange={(e) => set({ memo: e.target.value })} />
          </label>

          {preview && (
            <div className="paper-preview">
              <h3 className="paper-h" style={{ marginTop: 0 }}>
                この1枚のチェック結果：{preview.findings.length ? `${preview.findings.length}件の指摘` : "指摘なし"}
              </h3>
              {preview.notes.map((n) => (
                <p key={n} className="notice info" style={{ margin: "6px 0" }}>
                  {n}
                </p>
              ))}
              {preview.findings.map((f) => (
                <div key={f.id} className="paper-finding">
                  <div className="row" style={{ gap: 6 }}>
                    <span className={`badge solid ${f.impact}`}>{IMPACT_LABELS[f.impact]}</span>
                    <span className="badge cat">{CATEGORY_LABELS[f.category]}</span>
                    <b>{f.itemName}</b>
                    {f.tooth && <span className="muted small">{f.tooth}</span>}
                  </div>
                  <p style={{ margin: "6px 0 2px" }}>{f.reason}</p>
                  <p className="muted small" style={{ margin: 0 }}>
                    直し方：{f.fix}
                  </p>
                </div>
              ))}
            </div>
          )}

          <div className="row" style={{ marginTop: 16 }}>
            <button type="button" className="btn btn-outline" disabled={!!busy} onClick={check}>
              <ClipboardCheck size={18} aria-hidden />
              {busy === "preview" ? "チェック中…" : "この1枚をチェック"}
            </button>
            <span className="spacer" />
            <button type="button" className="btn" onClick={() => setEditing(null)}>
              キャンセル
            </button>
            <button type="button" className="btn btn-primary" disabled={!!busy || demo} onClick={save} title={demo ? "デモ環境では保存できません" : ""}>
              <Save size={18} aria-hidden />
              {busy === "save" ? "保存中…" : "保存"}
            </button>
          </div>
        </section>
      )}
    </>
  );
}
