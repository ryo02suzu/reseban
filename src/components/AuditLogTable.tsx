import { formatDateTime } from "@/lib/format";

export const ACTION_LABELS: Record<string, string> = {
  "login.success": "ログイン",
  "login.password_ok": "ログイン（パスワード確認）",
  "login.failure": "ログイン失敗",
  logout: "ログアウト",
  "invite.create": "招待リンク発行",
  "invite.accept": "アカウント作成",
  "password.change": "パスワード変更",
  "password.reset": "パスワード再設定",
  "password.reset_link": "再設定リンク発行",
  "2fa.enable": "2段階認証を有効化",
  "2fa.disable": "2段階認証を無効化",
  "terms.accept": "利用規約に同意",
  "audit.run": "チェック実行",
  "audit.demo": "サンプルでチェック",
  "audit.view": "レポート閲覧",
  "audit.rerun": "再チェック",
  "audit.delete": "チェック結果削除",
  "audit.export_csv": "CSV出力",
  "finding.update": "指摘の更新",
  "ai.explain": "AI説明",
  "ai.suggest": "AI算定漏れ候補",
  "ai.suggestion_update": "AI提案の採否",
  "ai.draft_rules": "AIルール案作成",
  "ai.draft_adopt": "AIルール案採用",
  "ai.draft_reject": "AIルール案却下",
  "ai.ping": "AI接続テスト",
  "rule.create": "ルール追加",
  "rule.update": "ルール編集",
  "rule.toggle": "ルール有効・無効",
  "rule.delete": "ルール削除",
  "rule.history_import": "実績CSV取込",
  "rule.reprioritize": "優先順位の並べ替え",
  "global_rule.create": "共通ルール追加",
  "global_rule.update": "共通ルール変更",
  "global_rule.delete": "共通ルール削除",
  "settings.update": "設定変更",
  "member.disable": "メンバー停止",
  "member.enable": "メンバー再開",
  "member.role": "権限変更",
  "data.delete_all": "データ全削除",
  "audit_log.export": "操作ログ出力",
  "clinic.create": "医院作成",
  "clinic.update": "医院情報変更",
  "master.import": "マスター取込",
  "retention.purge": "保存期間切れデータ削除",
};

export interface LogRow {
  id: number;
  createdAt: string;
  userEmail: string;
  action: string;
  target: string;
  ip: string;
  clinicId?: string | null;
  detail: Record<string, unknown>;
}

export function AuditLogTable({ rows, clinicNames }: { rows: LogRow[]; clinicNames?: Record<string, string> }) {
  return (
    <div className="table-wrap">
      <table>
        <thead>
          <tr>
            <th>日時</th>
            {clinicNames && <th>医院</th>}
            <th>ユーザー</th>
            <th>操作</th>
            <th>対象</th>
            <th>IP</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.id}>
              <td className="muted" style={{ whiteSpace: "nowrap" }}>{formatDateTime(r.createdAt)}</td>
              {clinicNames && <td>{r.clinicId ? clinicNames[r.clinicId] ?? r.clinicId : "—"}</td>}
              <td>{r.userEmail || "—"}</td>
              <td style={{ color: r.action === "login.failure" ? "var(--henrei)" : undefined }}>{ACTION_LABELS[r.action] ?? r.action}</td>
              <td className="small" style={{ wordBreak: "break-all" }}>{r.target}</td>
              <td className="small muted">{r.ip}</td>
            </tr>
          ))}
          {rows.length === 0 && (
            <tr>
              <td colSpan={6} className="empty">
                記録はまだありません
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}
