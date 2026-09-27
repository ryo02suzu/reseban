import Link from "next/link";
import { Building2 } from "lucide-react";
import { Nav, type NavItem } from "./Nav";
import { UserMenu } from "./UserMenu";

export function AppShell({
  nav,
  title,
  userName,
  roleLabel,
  children,
}: {
  nav: NavItem[];
  title: string;
  userName: string;
  roleLabel: string;
  children: React.ReactNode;
}) {
  return (
    <div className="app">
      <aside className="sidebar">
        <Link href="/" className="logo" aria-label="レセ番 トップへ">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/logo.png" alt="レセ番" />
        </Link>
        <Nav items={nav} />
      </aside>
      <div className="main">
        <header className="topbar">
          <span className="row" style={{ gap: 8 }}>
            <Building2 size={18} aria-hidden />
            {title}
          </span>
          <UserMenu name={userName} roleLabel={roleLabel} />
        </header>
        <main className="content">{children}</main>
      </div>
    </div>
  );
}

export const ROLE_LABELS = { operator: "運営者", owner: "管理者", staff: "スタッフ" } as const;

export const CLINIC_NAV = (isOwner: boolean): NavItem[] => [
  { href: "/", label: "チェック（取込）", icon: "check", exact: true },
  { href: "/report", label: "レポート", icon: "report" },
  { href: "/rules", label: "ルール", icon: "rules" },
  { href: "/settings", label: "設定", icon: "settings" },
  ...(isOwner
    ? ([
        { href: "/members", label: "メンバー", icon: "members", section: "管理" },
        { href: "/audit-log", label: "操作ログ", icon: "log", section: "管理" },
      ] as NavItem[])
    : []),
];

export const ADMIN_NAV: NavItem[] = [
  { href: "/admin", label: "医院", icon: "clinics", exact: true },
  { href: "/admin/masters", label: "マスター", icon: "masters" },
  { href: "/admin/rules", label: "共通ルール", icon: "rules" },
  { href: "/admin/audit-log", label: "操作ログ", icon: "log" },
];
