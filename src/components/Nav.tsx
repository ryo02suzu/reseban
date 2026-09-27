"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { BarChart3, Building2, ClipboardPen, Database, FileText, History, Settings, SquareCheckBig, Users } from "lucide-react";

const ICONS = { check: SquareCheckBig, paper: ClipboardPen, report: BarChart3, rules: FileText, settings: Settings, members: Users, log: History, clinics: Building2, masters: Database };

export interface NavItem {
  href: string;
  label: string;
  icon: keyof typeof ICONS;
  /** 完全一致で強調するか */
  exact?: boolean;
  section?: string;
}

export function Nav({ items }: { items: NavItem[] }) {
  const pathname = usePathname();
  return (
    <nav className="nav">
      {items.map(({ href, label, icon, exact, section }, i) => {
        const Icon = ICONS[icon];
        const active = exact ? pathname === href : pathname === href || pathname.startsWith(`${href}/`);
        const heading = section && section !== items[i - 1]?.section ? section : null;
        return (
          <div key={href}>
            {heading && <div className="nav-section">{heading}</div>}
            <Link href={href} aria-current={active ? "page" : undefined}>
              <Icon size={20} aria-hidden />
              {label}
            </Link>
          </div>
        );
      })}
    </nav>
  );
}
