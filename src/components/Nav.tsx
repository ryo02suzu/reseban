"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { BarChart3, FileText, Settings, SquareCheckBig } from "lucide-react";

const LINKS = [
  { href: "/", label: "チェック（取込）", icon: SquareCheckBig, match: (p: string) => p === "/" },
  { href: "/report", label: "レポート", icon: BarChart3, match: (p: string) => p.startsWith("/report") },
  { href: "/rules", label: "ルール", icon: FileText, match: (p: string) => p.startsWith("/rules") },
  { href: "/settings", label: "設定", icon: Settings, match: (p: string) => p.startsWith("/settings") },
];

export function Nav() {
  const pathname = usePathname();
  return (
    <nav className="nav">
      {LINKS.map(({ href, label, icon: Icon, match }) => (
        <Link key={href} href={href} aria-current={match(pathname) ? "page" : undefined}>
          <Icon size={20} aria-hidden />
          {label}
        </Link>
      ))}
    </nav>
  );
}
