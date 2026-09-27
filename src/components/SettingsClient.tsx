"use client";

import { useRouter } from "next/navigation";
import { useMemo, useRef, useState } from "react";
import { Building2, ChevronRight, ClipboardList, Lock, Search, Settings, ShieldCheck, Sparkles, Trash2 } from "lucide-react";
import { api, errorMessage } from "@/lib/client";
import { useToast } from "./Toast";

interface ClinicSettings {
  name: string;
  code: string;
  facilityCodes: string[];
  aiEnabled: boolean;
  require2fa: boolean;
  retentionMonths: number;
  aiMonthlyLimit: number;
}

export function SettingsClient({
  canEdit,
  myTotp,
  clinic: initial,
  facilities,
  ai,
}: {
  canEdit: boolean;
  myTotp: boolean;
  clinic: ClinicSettings;
  facilities: { code: string; name: string }[];
  ai: { provider: string | null; region: string; domestic: boolean };
}) {
  const router = useRouter();
  const toast = useToast();
  const [c, setC] = useState(initial);
  const [name, setName] = useState(initial.name);
  const [retention, setRetention] = useState(String(initial.retentionMonths));
  const [q, setQ] = useState("");
  const [onlyFiled, setOnlyFiled] = useState(false);
  const [confirmText, setConfirmText] = useState("");
  const deleteDialog = useRef<HTMLDialogElement>(null);

  const filed = new Set(c.facilityCodes);
  const shown = useMemo(
    () =>
      facilities.filter(
        (f) => (!onlyFiled || filed.has(f.code)) && (!q.trim() || f.name.includes(q.trim()) || f.code.includes(q.trim())),
      ),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [facilities, q, onlyFiled, c.facilityCodes],
  );

  const save = async (patch: Partial<ClinicSettings>, msg = "保存しました") => {
    const prev = c;
    setC((x) => ({ ...x, ...patch }));
    try {
      await api("/api/settings", { method: "PUT", json: patch });
      toast.show(msg);
      router.refresh();
    } catch (e) {
      setC(prev);
      toast.show(errorMessage(e));
    }
  };

  const toggleFacility = (code: string, name: string) => {
    const next = filed.has(code) ? c.facilityCodes.filter((x) => x !== code) : [...c.facilityCodes, code];
    save({ facilityCodes: next }, filed.has(code) ? `「${name}」を外しました` : `「${name}」を届出済みにしました`);
  };

  return (
    <>
      <div className="page-head">
        <div>
          <h1 className="row" style={{ gap: 10 }}>
            <Settings size={28} aria-hidden /> 設定
          </h1>
          <p>医院の情報・施設基準・AI・セキュリティの設定です。{!canEdit && "（変更は管理者のみ）"}</p>
        </div>
      </div>

      <div className="grid grid-2">
        <section className="card">
          <div className="card-head">
            <Building2 className="icon" size={24} aria-hidden />
            <div>
              <h2>医療機関情報</h2>
              <p>医療機関コードは最初に取り込んだレセ電から自動で登録され、別の医療機関のファイルは取り込めなくなります。</p>
            </div>
          </div>
          <div className="grid" style={{ gridTemplateColumns: "minmax(0, 1.4fr) minmax(0, 1fr)", gap: 14 }}>
            <label className="field">
              <span>医院名</span>
              <input type="text" value={name} onChange={(e) => setName(e.target.value)} readOnly={!canEdit} />
            </label>
            <label className="field">
              <span>医療機関コード</span>
              <input type="text" value={c.code} readOnly placeholder="レセ電取込時に自動登録" />
            </label>
          </div>
          {canEdit && (
            <div className="row" style={{ marginTop: 12, justifyContent: "flex-end" }}>
              <button type="button" className="btn btn-primary btn-sm" disabled={name === c.name || !name.trim()} onClick={() => save({ name })}>
                保存
              </button>
            </div>
          )}

          <hr className="divider" />
          <div className="card-head">
            <Sparkles className="icon" size={24} aria-hidden />
            <div>
              <h2>AI機能</h2>
              <p>根拠の説明と算定漏れ候補の提案に使います。合否の判定には使いません。</p>
            </div>
          </div>
          <div className="row" style={{ padding: "4px 0" }}>
            <b>AI機能をONにする</b>
            <span className="spacer" />
            <input
              type="checkbox"
              className="toggle"
              checked={c.aiEnabled}
              disabled={!canEdit || !ai.provider}
              onChange={() => save({ aiEnabled: !c.aiEnabled }, c.aiEnabled ? "AI機能をOFFにしました" : "AI機能をONにしました")}
              aria-label="AI機能をONにする"
            />
          </div>
          <p className="muted small" style={{ margin: "6px 0 0" }}>
            接続先：
            {ai.provider ? (
              <>
                {ai.provider === "bedrock" ? "Amazon Bedrock" : ai.provider === "vertex" ? "Google Cloud Vertex AI" : "Anthropic API"}（{ai.region}）
                {ai.domestic ? <span className="badge ok" style={{ marginLeft: 6 }}>国内</span> : <span className="badge neutral" style={{ marginLeft: 6, color: "var(--henrei)" }}>国外</span>}
              </>
            ) : (
              "未設定（運営者の設定待ち）"
            )}
            　／　月{c.aiMonthlyLimit}回まで
          </p>
          <p className="notice info row" style={{ marginTop: 10, alignItems: "flex-start", flexWrap: "nowrap" }}>
            <ShieldCheck size={18} color="var(--primary)" aria-hidden style={{ flexShrink: 0 }} />
            <span>AIには氏名・保険証番号・カルテ番号を渡しません。渡すのは項目名・病名・部位・指摘の理由などだけです。</span>
          </p>
        </section>

        <section className="card">
          <div className="card-head">
            <ClipboardList className="icon" size={24} aria-hidden />
            <div>
              <h2>施設基準の届出</h2>
              <p>地方厚生（支）局に届け出ている施設基準にチェックしてください。「施設基準のズレ」の点検に使います（{c.facilityCodes.length}件登録）。</p>
            </div>
          </div>
          <div className="row" style={{ marginBottom: 10, flexWrap: "nowrap" }}>
            <div className="search" style={{ flex: 1 }}>
              <Search size={16} aria-hidden />
              <input type="search" placeholder="名称・コードで検索（例：外来診療医療安全、1352）" value={q} onChange={(e) => setQ(e.target.value)} />
            </div>
            <label className="check" style={{ whiteSpace: "nowrap" }}>
              <input type="checkbox" checked={onlyFiled} onChange={(e) => setOnlyFiled(e.target.checked)} />
              届出済みだけ
            </label>
          </div>
          <div className="facility-grid" style={{ maxHeight: 360, overflowY: "auto", gridTemplateColumns: "1fr" }}>
            {shown.map((f) => (
              <label key={f.code} className="check">
                <input type="checkbox" checked={filed.has(f.code)} disabled={!canEdit} onChange={() => toggleFacility(f.code, f.name)} />
                <span>
                  {f.name} <span className="muted small">（{f.code}）</span>
                </span>
              </label>
            ))}
            {shown.length === 0 && <p className="muted small">該当する施設基準がありません</p>}
          </div>
          <p className="muted small" style={{ margin: "8px 0 0" }}>
            一覧は支払基金の歯科診療行為マスター（令和8年版）に設定されている施設基準コードです。レセ電の「届出」欄（歯初診・補管）は自動で反映します。変更後はレポートの「再チェック」で反映されます。
          </p>
        </section>

        <section className="card">
          <div className="card-head">
            <Lock className="icon" size={24} aria-hidden />
            <div>
              <h2>セキュリティ・データ保存</h2>
              <p>医療情報システムの安全管理ガイドラインに沿った設定です。</p>
            </div>
          </div>
          <div className="row" style={{ padding: "8px 0", borderBottom: "1px solid var(--border)" }}>
            <div>
              <b>全員に2段階認証を必須にする</b>
              <div className="muted small">ONにすると、未設定のメンバーは次のログイン時に設定を求められます。</div>
            </div>
            <span className="spacer" />
            <input
              type="checkbox"
              className="toggle"
              checked={c.require2fa}
              disabled={!canEdit || (!myTotp && !c.require2fa)}
              title={!myTotp ? "先にご自身の2段階認証を設定してください" : ""}
              onChange={() => save({ require2fa: !c.require2fa })}
              aria-label="2段階認証を必須にする"
            />
          </div>
          <div className="row" style={{ padding: "12px 0", flexWrap: "nowrap" }}>
            <div style={{ flex: 1 }}>
              <b>レセプトデータの保存期間</b>
              <div className="muted small">過ぎた月のデータは自動で削除します（過去6ヶ月の点検のため7ヶ月以上）。</div>
            </div>
            <span className="spacer" />
            <input type="text" inputMode="numeric" value={retention} onChange={(e) => setRetention(e.target.value.replace(/\D/g, ""))} readOnly={!canEdit} style={{ width: 70 }} />
            <span style={{ whiteSpace: "nowrap" }}>ヶ月</span>
            {canEdit && (
              <button type="button" className="btn btn-sm" disabled={retention === String(c.retentionMonths)} onClick={() => save({ retentionMonths: Number(retention) })}>
                保存
              </button>
            )}
          </div>
        </section>
      </div>

      {canEdit && (
        <div className="danger-card">
          <Trash2 size={28} aria-hidden />
          <div style={{ flex: 1 }}>
            <h2>データをすべて削除</h2>
            <div className="muted small">この医院のレセプト・チェック結果・指摘の状態とメモ・独自ルール・実績を削除します。アカウントと操作ログは残ります。復元はできません。</div>
          </div>
          <button
            type="button"
            className="btn btn-danger"
            onClick={() => {
              setConfirmText("");
              deleteDialog.current?.showModal();
            }}
          >
            <Trash2 size={16} aria-hidden /> データをすべて削除 <ChevronRight size={16} aria-hidden />
          </button>
        </div>
      )}

      <dialog ref={deleteDialog} style={{ width: "min(480px, calc(100vw - 32px))" }}>
        <h2 style={{ color: "var(--henrei)", marginBottom: 12 }}>本当にすべて削除しますか？</h2>
        <p className="small">元に戻せません。確認のため「削除」と入力してください。</p>
        <input type="text" value={confirmText} onChange={(e) => setConfirmText(e.target.value)} placeholder="削除" />
        <div className="row" style={{ justifyContent: "flex-end", marginTop: 16 }}>
          <button type="button" className="btn" onClick={() => deleteDialog.current?.close()}>
            キャンセル
          </button>
          <button
            type="button"
            className="btn btn-danger"
            disabled={confirmText !== "削除"}
            onClick={async () => {
              try {
                await api("/api/data", { method: "DELETE", json: { confirm: confirmText } });
                deleteDialog.current?.close();
                toast.show("データを削除しました");
                router.push("/");
                router.refresh();
              } catch (e) {
                toast.show(errorMessage(e));
              }
            }}
          >
            削除する
          </button>
        </div>
      </dialog>
      {toast.node}
    </>
  );
}
