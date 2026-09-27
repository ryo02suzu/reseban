export default function PublicLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="auth-wrap">
      <div className="auth-box">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/logo.png" alt="レセ番" className="auth-logo" />
        {children}
      </div>
      <footer className="auth-footer">
        <a href="/legal/terms">利用規約</a>
        <a href="/legal/privacy">プライバシーポリシー</a>
      </footer>
    </div>
  );
}
