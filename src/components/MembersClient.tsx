"use client";

import { useState } from "react";
import { UserPlus } from "lucide-react";
import { api, errorMessage } from "@/lib/client";
import { formatDateTime } from "@/lib/format";
import { LinkBox } from "./LinkBox";
import { useToast } from "./Toast";

interface Member {
  id: string;
  email: string;
  name: string;
  role: "owner" | "staff";
  disabled: boolean;
  totpEnabled: boolean;
  lastLoginAt: string | null;
}

export function MembersClient({ me, initial }: { me: string; initial: Member[] }) {
  const toast = useToast();
  const [members, setMembers] = useState(initial);
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<"staff" | "owner">("staff");
  const [link, setLink] = useState<{ path: string; note: string } | null>(null);

  const patch = async (m: Member, body: Record<string, unknown>, apply?: Partial<Member>) => {
    try {
      const res = await api<{ path?: string }>(`/api/members/${m.id}`, { method: "PATCH", json: body });
      if (res.path) setLink({ path: res.path, note: `${m.name}さんのパスワード再設定リンクです（24時間有効・1回限り）。本人に直接渡してください。` });
      if (apply) setMembers((ms) => ms.map((x) => (x.id === m.id ? { ...x, ...apply } : x)));
      toast.show(res.path ? "再設定リンクを発行しました" : "変更しました");
    } catch (e) {
      toast.show(errorMessage(e));
    }
  };

  return (
    <>
      <div className="page-head">
        <div>
          <h1>メンバー</h1>
          <p>医院のスタッフのアカウントを管理します。招待・再設定はリンクを発行し、院内で本人に渡してください。</p>
        </div>
      </div>

      <section className="card">
        <div className="card-head">
          <UserPlus className="icon" size={24} aria-hidden />
          <div>
            <h2>メンバーを招待</h2>
            <p>「管理者」はルール・設定・メンバー・操作ログを変更・閲覧できます。「スタッフ」はチェックとレポートの対応ができます。</p>
          </div>
        </div>
        <form
          className="row"
          style={{ flexWrap: "nowrap" }}
          onSubmit={async (e) => {
            e.preventDefault();
            try {
              const res = await api<{ path: string }>("/api/members", { method: "POST", json: { email, role } });
              setLink({ path: res.path, note: `${email} さんの招待リンクです（72時間有効・1回限り）。本人に直接渡してください。` });
              setEmail("");
            } catch (err) {
              toast.show(errorMessage(err));
            }
          }}
        >
          <input type="text" inputMode="email" placeholder="メールアドレス" value={email} onChange={(e) => setEmail(e.target.value)} />
          <select value={role} onChange={(e) => setRole(e.target.value as "staff" | "owner")} style={{ width: 140 }}>
            <option value="staff">スタッフ</option>
            <option value="owner">管理者</option>
          </select>
          <button type="submit" className="btn btn-primary" disabled={!email}>
            招待リンクを発行
          </button>
        </form>
        {link && (
          <div style={{ marginTop: 14 }}>
            <LinkBox path={link.path} note={link.note} />
          </div>
        )}
      </section>

      <section className="card">
        <h2 style={{ marginBottom: 14 }}>メンバー一覧</h2>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>名前</th>
                <th>メールアドレス</th>
                <th>権限</th>
                <th>2段階認証</th>
                <th>最終ログイン</th>
                <th>状態</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {members.map((m) => (
                <tr key={m.id} style={{ opacity: m.disabled ? 0.55 : 1 }}>
                  <td>
                    {m.name}
                    {m.id === me && <span className="badge neutral" style={{ marginLeft: 6 }}>自分</span>}
                  </td>
                  <td>{m.email}</td>
                  <td>
                    <select
                      value={m.role}
                      disabled={m.id === me}
                      onChange={(e) => patch(m, { role: e.target.value }, { role: e.target.value as Member["role"] })}
                      style={{ width: 120 }}
                    >
                      <option value="staff">スタッフ</option>
                      <option value="owner">管理者</option>
                    </select>
                  </td>
                  <td>{m.totpEnabled ? <span className="badge ok">設定済み</span> : <span className="badge neutral">未設定</span>}</td>
                  <td className="muted small">{m.lastLoginAt ? formatDateTime(m.lastLoginAt) : "—"}</td>
                  <td>{m.disabled ? "停止中" : "利用中"}</td>
                  <td>
                    <div className="row" style={{ flexWrap: "nowrap" }}>
                      <button type="button" className="btn btn-sm" onClick={() => patch(m, { action: "reset" })}>
                        再設定リンク
                      </button>
                      {m.id !== me && (
                        <button
                          type="button"
                          className={`btn btn-sm${m.disabled ? "" : " btn-danger"}`}
                          onClick={() => {
                            if (!m.disabled && !confirm(`${m.name}さんを停止しますか？ログイン中なら即座にログアウトされます。`)) return;
                            patch(m, { disabled: !m.disabled }, { disabled: !m.disabled });
                          }}
                        >
                          {m.disabled ? "再開" : "停止"}
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
      {toast.node}
    </>
  );
}
