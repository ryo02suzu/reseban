"use client";

import Link from "next/link";
import { useState } from "react";
import { Building2, Plus } from "lucide-react";
import { api, errorMessage } from "@/lib/client";
import { formatDateTime } from "@/lib/format";
import { LinkBox } from "./LinkBox";
import { useToast } from "./Toast";

interface Row {
  id: string;
  name: string;
  code: string;
  status: "active" | "suspended";
  note: string;
  aiMonthlyLimit: number;
  aiUsed: number;
  members: number;
  runs: number;
  lastRun: string | null;
  createdAt: string;
}

export function AdminClinicsClient({ initial, missingMasters }: { initial: Row[]; missingMasters: string[] }) {
  const toast = useToast();
  const [rows, setRows] = useState(initial);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [note, setNote] = useState("");
  const [link, setLink] = useState<{ path: string; note: string } | null>(null);
  const [opEmail, setOpEmail] = useState("");

  const patch = async (r: Row, body: Record<string, unknown>) => {
    try {
      const res = await api<{ path?: string; clinic?: Partial<Row> }>(`/api/admin/clinics/${r.id}`, { method: "PATCH", json: body });
      if (res.path) setLink({ path: res.path, note: `${r.name}の管理者の招待リンクです（7日間有効・1回限り）。` });
      if (res.clinic) setRows((rs) => rs.map((x) => (x.id === r.id ? { ...x, ...res.clinic } : x)));
      toast.show(res.path ? "招待リンクを発行しました" : "変更しました");
    } catch (e) {
      toast.show(errorMessage(e));
    }
  };

  return (
    <>
      <div className="page-head">
        <div>
          <h1>医院</h1>
          <p>契約医院の追加・停止と、利用状況の確認。運営者は医院のレセプトやチェック結果の中身は見られません。</p>
        </div>
      </div>
      {missingMasters.length > 0 && (
        <p className="notice" style={{ marginBottom: 16 }}>
          必須のマスターが未取込です：{missingMasters.join("、")}。<Link href="/admin/masters">マスター</Link>から取り込んでください。
        </p>
      )}

      <div className="grid grid-2">
        <section className="card">
          <div className="card-head">
            <Building2 className="icon" size={24} aria-hidden />
            <div>
              <h2>医院を追加</h2>
              <p>医院を作り、その医院の管理者（院長・事務長など）の招待リンクを発行します。</p>
            </div>
          </div>
          <form
            className="grid"
            style={{ gap: 12 }}
            onSubmit={async (e) => {
              e.preventDefault();
              try {
                const res = await api<{ clinic: Row; path: string }>("/api/admin/clinics", { method: "POST", json: { name, ownerEmail: email, note } });
                setRows((rs) => [...rs, { ...res.clinic, aiUsed: 0, members: 0, runs: 0, lastRun: null, createdAt: new Date().toISOString() }]);
                setLink({ path: res.path, note: `${name}の管理者（${email}）の招待リンクです（7日間有効・1回限り）。本人に安全な方法で渡してください。` });
                setName("");
                setEmail("");
                setNote("");
              } catch (err) {
                toast.show(errorMessage(err));
              }
            }}
          >
            <label className="field">
              <span>医院名</span>
              <input type="text" value={name} onChange={(e) => setName(e.target.value)} placeholder="例：さくら歯科クリニック" />
            </label>
            <label className="field">
              <span>管理者のメールアドレス</span>
              <input type="text" inputMode="email" value={email} onChange={(e) => setEmail(e.target.value)} />
            </label>
            <label className="field">
              <span>メモ（契約プラン・請求先など、任意）</span>
              <input type="text" value={note} onChange={(e) => setNote(e.target.value)} />
            </label>
            <button type="submit" className="btn btn-primary" disabled={!name || !email}>
              <Plus size={16} aria-hidden /> 医院を追加して招待リンクを発行
            </button>
          </form>
          {link && (
            <div style={{ marginTop: 14 }}>
              <LinkBox path={link.path} note={link.note} />
            </div>
          )}
        </section>

        <section className="card">
          <h2 style={{ marginBottom: 8 }}>運営者を追加</h2>
          <p className="muted small" style={{ marginTop: 0 }}>運営者は2段階認証が必須です。</p>
          <form
            className="row"
            style={{ flexWrap: "nowrap" }}
            onSubmit={async (e) => {
              e.preventDefault();
              try {
                const res = await api<{ path: string }>("/api/admin/operators", { method: "POST", json: { email: opEmail } });
                setLink({ path: res.path, note: `運営者（${opEmail}）の招待リンクです（24時間有効・1回限り）。` });
                setOpEmail("");
              } catch (err) {
                toast.show(errorMessage(err));
              }
            }}
          >
            <input type="text" inputMode="email" placeholder="メールアドレス" value={opEmail} onChange={(e) => setOpEmail(e.target.value)} />
            <button type="submit" className="btn" disabled={!opEmail}>
              招待リンクを発行
            </button>
          </form>
        </section>
      </div>

      <section className="card" style={{ marginTop: 20 }}>
        <h2 style={{ marginBottom: 14 }}>契約医院（{rows.length}）</h2>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>医院名</th>
                <th>医療機関コード</th>
                <th className="num">メンバー</th>
                <th className="num">チェック回数</th>
                <th>最終チェック</th>
                <th className="num">今月のAI</th>
                <th>状態</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id} style={{ opacity: r.status === "suspended" ? 0.55 : 1 }}>
                  <td>
                    {r.name}
                    {r.note && <div className="muted small">{r.note}</div>}
                  </td>
                  <td>{r.code || "—"}</td>
                  <td className="num">{r.members}</td>
                  <td className="num">{r.runs}</td>
                  <td className="muted small">{r.lastRun ? formatDateTime(r.lastRun) : "—"}</td>
                  <td className="num">
                    {r.aiUsed} / {r.aiMonthlyLimit}
                  </td>
                  <td>{r.status === "active" ? <span className="badge ok">利用中</span> : <span className="badge neutral">停止中</span>}</td>
                  <td>
                    <div className="row" style={{ flexWrap: "nowrap" }}>
                      <button
                        type="button"
                        className="btn btn-sm"
                        onClick={() => {
                          const e = prompt("追加する管理者のメールアドレス");
                          if (e) patch(r, { inviteOwner: e });
                        }}
                      >
                        管理者を招待
                      </button>
                      <button
                        type="button"
                        className="btn btn-sm"
                        onClick={() => {
                          const n = prompt("今月以降のAI利用回数の上限（月あたり）", String(r.aiMonthlyLimit));
                          if (n !== null) patch(r, { aiMonthlyLimit: Number(n) });
                        }}
                      >
                        AI上限
                      </button>
                      <button
                        type="button"
                        className={`btn btn-sm${r.status === "active" ? " btn-danger" : ""}`}
                        onClick={() => {
                          if (r.status === "active" && !confirm(`${r.name}の利用を停止しますか？全メンバーがログインできなくなります（データは残ります）。`)) return;
                          patch(r, { status: r.status === "active" ? "suspended" : "active" });
                        }}
                      >
                        {r.status === "active" ? "停止" : "再開"}
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
              {rows.length === 0 && (
                <tr>
                  <td colSpan={8} className="empty">
                    まだ医院がありません
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>
      {toast.node}
    </>
  );
}
