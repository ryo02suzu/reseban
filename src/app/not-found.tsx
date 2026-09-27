import Link from "next/link";

export const metadata = { title: "ページが見つかりません | レセ番" };

export default function NotFound() {
  return (
    <div className="auth-wrap">
      <div className="auth-box">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/logo.png" alt="レセ番" className="auth-logo" />
        <h1>ページが見つかりません</h1>
        <p className="muted">URLが間違っているか、削除された可能性があります。チェック結果の場合は、保存期間を過ぎて削除されたか、別の医院のものです。</p>
        <Link className="btn btn-primary" href="/">
          トップへ戻る
        </Link>
      </div>
    </div>
  );
}
