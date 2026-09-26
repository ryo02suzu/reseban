"use client";

import { useRouter } from "next/navigation";
import { useRef, useState } from "react";
import {
  Building2,
  CheckCircle2,
  Database,
  ExternalLink,
  FileText,
  Info,
  MessageSquareText,
  Plus,
  RefreshCw,
  Settings,
  ShieldCheck,
  Smile,
  Sparkles,
  Stethoscope,
  Trash2,
  XCircle,
  ChevronRight,
  ClipboardList,
} from "lucide-react";
import type { MasterKind, MasterStatus, Settings as SettingsT } from "@/lib/types";
import { formatDateTime } from "@/lib/format";
import { api, errorMessage } from "@/lib/client";
import { useToast } from "./Toast";

/** 支払基金「診療報酬情報提供サービス／基本マスター」 */
const SSK_MASTER_URL = "https://www.ssk.or.jp/seikyushiharai/tensuhyo/kihonmasta/index.html";

const MASTER_ROWS: { kind: MasterKind; label: string; icon: React.ReactNode }[] = [
  { kind: "shinryo", label: "歯科診療行為", icon: <Stethoscope size={20} /> },
  { kind: "byomei", label: "傷病名", icon: <FileText size={20} /> },
  { kind: "shishiki", label: "歯式", icon: <Smile size={20} /> },
  { kind: "comment", label: "コメント", icon: <MessageSquareText size={20} /> },
];

interface AiInfo {
  provider: string | null;
  region: string;
  model: string;
  domestic: boolean;
}

export function SettingsClient({ initialSettings, masters: initialMasters, ai }: { initialSettings: SettingsT; masters: MasterStatus[]; ai: AiInfo }) {
  const router = useRouter();
  const toast = useToast();
  const [settings, setSettings] = useState(initialSettings);
  const [clinicName, setClinicName] = useState(initialSettings.clinicName);
  const [masters, setMasters] = useState(initialMasters);
  const [newStandard, setNewStandard] = useState("");
  const [adding, setAdding] = useState(false);
  const [ping, setPing] = useState<{ ok: boolean; msg: string } | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [confirmText, setConfirmText] = useState("");
  const deleteDialog = useRef<HTMLDialogElement>(null);
  const inputs = useRef<Partial<Record<MasterKind, HTMLInputElement | null>>>({});

  const save = async (patch: Partial<SettingsT>, msg = "保存しました") => {
    const prev = settings;
    setSettings((s) => ({ ...s, ...patch })); // 画面は先に切り替える
    try {
      const next = await api<SettingsT>("/api/settings", { method: "PUT", json: patch });
      setSettings(next);
      toast.show(msg);
      router.refresh();
    } catch (e) {
      setSettings(prev);
      toast.show(errorMessage(e));
    }
  };

  const importMaster = async (kind: MasterKind, file?: File) => {
    if (!file) return;
    setBusy(kind);
    try {
      const fd = new FormData();
      fd.append("file", file);
      const res = await api<{ count: number; importedAt: string; fileName: string; sample: { code: string; name: string; points?: number }[] }>(
        `/api/masters/${kind}`,
        { method: "POST", body: fd },
      );
      setMasters((ms) => ms.map((m) => (m.kind === kind ? { kind, count: res.count, importedAt: res.importedAt, fileName: res.fileName } : m)));
      const ex = res.sample.map((s) => `${s.code} ${s.name}${s.points !== undefined ? ` ${s.points}点` : ""}`).join(" ／ ");
      toast.show(`${res.count.toLocaleString()}件を取り込みました（例：${ex}）`);
    } catch (e) {
      toast.show(errorMessage(e));
    } finally {
      setBusy(null);
    }
  };

  const testAi = async () => {
    setBusy("ping");
    setPing(null);
    try {
      const { model } = await api<{ model: string }>("/api/ai/ping", { method: "POST" });
      setPing({ ok: true, msg: `接続成功：${model}` });
    } catch (e) {
      setPing({ ok: false, msg: errorMessage(e) });
    } finally {
      setBusy(null);
    }
  };

  const deleteAll = async () => {
    try {
      await api("/api/data", { method: "DELETE" });
      deleteDialog.current?.close();
      toast.show("すべてのデータを削除しました");
      router.push("/");
      router.refresh();
    } catch (e) {
      toast.show(errorMessage(e));
    }
  };

  return (
    <>
      <div className="page-head">
        <div>
          <h1 className="row" style={{ gap: 10 }}>
            <Settings size={28} aria-hidden /> 設定
          </h1>
          <p>システムの各種設定を行います。</p>
        </div>
      </div>

      <div className="grid grid-2">
        {/* 医療機関情報 */}
        <section className="card">
          <div className="card-head">
            <Building2 className="icon" size={24} aria-hidden />
            <div>
              <h2>医療機関情報</h2>
              <p>医院名・医療機関コードを設定します。医療機関コードはレセ電から自動で取得されます。</p>
            </div>
          </div>
          <div className="grid" style={{ gridTemplateColumns: "minmax(0, 1.4fr) minmax(0, 1fr)", gap: 14 }}>
            <label className="field">
              <span>医院名</span>
              <input type="text" value={clinicName} onChange={(e) => setClinicName(e.target.value)} placeholder="例：○○歯科医院" />
            </label>
            <label className="field">
              <span>医療機関コード</span>
              <input type="text" value={settings.clinicCode} readOnly placeholder="レセ電取込時に自動入力" />
            </label>
          </div>
          <div className="row" style={{ marginTop: 12 }}>
            <span className="muted small row" style={{ gap: 4 }}>
              <RefreshCw size={14} aria-hidden /> 医療機関コードはレセ電から自動取得
            </span>
            <span className="spacer" />
            <button type="button" className="btn btn-primary btn-sm" disabled={clinicName === settings.clinicName} onClick={() => save({ clinicName })}>
              保存
            </button>
          </div>
        </section>

        {/* 施設基準 */}
        <section className="card">
          <div className="card-head">
            <ClipboardList className="icon" size={24} aria-hidden />
            <div>
              <h2>施設基準の届出</h2>
              <p>届け出ている施設基準にチェックしてください。ここが「施設基準のズレ」チェックに使われます。</p>
            </div>
            <span className="spacer" />
            <button type="button" className="btn btn-outline btn-sm" onClick={() => setAdding((v) => !v)}>
              <Plus size={14} aria-hidden /> 項目を追加
            </button>
          </div>
          {adding && (
            <div className="row" style={{ marginBottom: 12, flexWrap: "nowrap" }}>
              <input type="text" value={newStandard} onChange={(e) => setNewStandard(e.target.value)} placeholder="施設基準の名称（ルールの施設基準名と同じにする）" />
              <button
                type="button"
                className="btn btn-primary btn-sm"
                disabled={!newStandard.trim()}
                onClick={async () => {
                  await save({ facilityStandards: [...settings.facilityStandards, { name: newStandard.trim(), filed: true }] }, "追加しました");
                  setNewStandard("");
                  setAdding(false);
                }}
              >
                追加
              </button>
            </div>
          )}
          <div className="facility-grid">
            {settings.facilityStandards.map((s, i) => (
              <label key={s.name} className="check">
                <input
                  type="checkbox"
                  checked={s.filed}
                  onChange={() =>
                    save(
                      { facilityStandards: settings.facilityStandards.map((x, j) => (j === i ? { ...x, filed: !x.filed } : x)) },
                      s.filed ? `「${s.name}」を未届出にしました` : `「${s.name}」を届出済みにしました`,
                    )
                  }
                />
                {s.name}
              </label>
            ))}
          </div>
          <p className="muted small" style={{ margin: "8px 0 0" }}>
            ※ 初期の名称は令和6年度改定時点のものです。令和8年度改定で名称が変わったものは、項目を追加して使ってください。変えたあとはレポートの「再チェック」で反映されます。
          </p>
        </section>

        {/* マスター */}
        <section className="card">
          <div className="card-head">
            <Database className="icon" size={24} aria-hidden />
            <div>
              <h2>マスター取込</h2>
              <p>支払基金のマスター（CSV）を取り込みます。改定のたびに最新のものを入れてください。</p>
            </div>
          </div>
          {MASTER_ROWS.map(({ kind, label, icon }) => {
            const m = masters.find((x) => x.kind === kind);
            return (
              <div className="master-row" key={kind}>
                <span className="master-icon">{icon}</span>
                <b>{label}</b>
                <div className="master-meta muted small">
                  件数：{m?.count ? `${m.count.toLocaleString()}件` : "未取込"}
                  <br />
                  取込日：{m?.importedAt ? formatDateTime(m.importedAt).slice(0, 10) : "—"}
                </div>
                <div>
                  <button type="button" className="btn btn-primary btn-sm" style={{ minWidth: 88 }} disabled={busy === kind} onClick={() => inputs.current[kind]?.click()}>
                    {busy === kind ? "取込中…" : "取り込む"}
                  </button>
                  <input
                    ref={(el) => {
                      inputs.current[kind] = el;
                    }}
                    type="file"
                    accept=".csv,.txt"
                    hidden
                    onChange={(e) => {
                      importMaster(kind, e.target.files?.[0]);
                      e.target.value = "";
                    }}
                  />
                </div>
                <a className="master-link small row" style={{ gap: 4 }} href={SSK_MASTER_URL} target="_blank" rel="noreferrer">
                  <ExternalLink size={14} aria-hidden /> 支払基金のページ
                </a>
              </div>
            );
          })}
          <p className="notice info row" style={{ marginTop: 14, flexWrap: "nowrap" }}>
            <Info size={16} color="var(--primary)" aria-hidden style={{ flexShrink: 0 }} />
            <span>
              マスターは社会保険診療報酬支払基金の「基本マスター」ページから無料でダウンロードできます。歯科診療行為マスターが無いと、名称で判定するルールが動きません。
            </span>
          </p>
        </section>

        {/* AI */}
        <section className="card">
          <div className="card-head">
            <Sparkles className="icon" size={24} aria-hidden />
            <div>
              <h2>AI設定</h2>
              <p>AI機能の設定を行います。AIは補助機能としてご利用いただけます（合否の判定には使いません）。</p>
            </div>
          </div>
          <div style={{ border: "1px solid var(--border)", borderRadius: 8, padding: "4px 16px" }}>
            <div className="row" style={{ padding: "12px 0", borderBottom: "1px solid var(--border)" }}>
              <b>AI機能をONにする</b>
              <span className="spacer" />
              <input
                type="checkbox"
                className="toggle"
                checked={settings.aiEnabled}
                onChange={() => save({ aiEnabled: !settings.aiEnabled }, settings.aiEnabled ? "AI機能をOFFにしました" : "AI機能をONにしました")}
                aria-label="AI機能をONにする"
              />
            </div>
            <div className="row" style={{ padding: "12px 0", borderBottom: "1px solid var(--border)" }}>
              <b>接続先</b>
              <span className="spacer" />
              {ai.provider ? (
                <span className="small">
                  {ai.provider === "bedrock" ? "Amazon Bedrock" : ai.provider === "vertex" ? "Google Cloud Vertex AI" : "Anthropic API"}（{ai.region}）
                  {ai.domestic ? <span className="badge ok" style={{ marginLeft: 6 }}>国内</span> : <span className="badge neutral" style={{ marginLeft: 6, color: "var(--henrei)" }}>国外</span>}
                </span>
              ) : (
                <span className="small" style={{ color: "var(--henrei)" }}>未設定（サーバーの環境変数 AI_PROVIDER）</span>
              )}
            </div>
            <div className="row" style={{ padding: "12px 0" }}>
              <b>接続テスト</b>
              <button type="button" className="btn btn-outline btn-sm" style={{ marginLeft: 16 }} disabled={!ai.provider || busy === "ping"} onClick={testAi}>
                {busy === "ping" ? "テスト中…" : "テストを実行"}
              </button>
              {ping && (
                <span className="small row" style={{ gap: 4, color: ping.ok ? "var(--more)" : "var(--henrei)" }}>
                  {ping.ok ? <CheckCircle2 size={16} /> : <XCircle size={16} />}
                  {ping.msg}
                </span>
              )}
            </div>
          </div>
          <h3 style={{ margin: "18px 0 8px" }}>AI利用に関する注意事項</h3>
          <div className="notice info row" style={{ alignItems: "flex-start", flexWrap: "nowrap" }}>
            <ShieldCheck size={20} color="var(--primary)" aria-hidden style={{ flexShrink: 0 }} />
            <span>
              AIには氏名・保険証番号・カルテ番号を渡しません。渡すのは項目名・病名・部位・指摘の理由などだけです。
              接続先は国内リージョン（AWS東京・Google Cloud東京）を推奨します。
              {!ai.domestic && ai.provider && <b style={{ color: "var(--henrei)" }}> 現在の接続先は国内リージョンではありません。</b>}
            </span>
          </div>
        </section>
      </div>

      <div className="danger-card">
        <Trash2 size={28} aria-hidden />
        <div style={{ flex: 1 }}>
          <h2>全データを削除</h2>
          <div className="muted small">チェック結果・指摘の状態・メモ・ルール・設定・マスターなど、すべてのデータを削除します。復元はできません。</div>
        </div>
        <button
          type="button"
          className="btn btn-danger"
          onClick={() => {
            setConfirmText("");
            deleteDialog.current?.showModal();
          }}
        >
          <Trash2 size={16} aria-hidden /> 全データを削除 <ChevronRight size={16} aria-hidden />
        </button>
      </div>

      <dialog ref={deleteDialog} style={{ width: "min(480px, calc(100vw - 32px))" }}>
        <h2 style={{ color: "var(--henrei)", marginBottom: 12 }}>本当にすべて削除しますか？</h2>
        <p className="small">元に戻せません。確認のため「削除」と入力してください。</p>
        <input type="text" value={confirmText} onChange={(e) => setConfirmText(e.target.value)} placeholder="削除" />
        <div className="row" style={{ justifyContent: "flex-end", marginTop: 16 }}>
          <button type="button" className="btn" onClick={() => deleteDialog.current?.close()}>
            キャンセル
          </button>
          <button type="button" className="btn btn-danger" disabled={confirmText !== "削除"} onClick={deleteAll}>
            削除する
          </button>
        </div>
      </dialog>
      {toast.node}
    </>
  );
}
