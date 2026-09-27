"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { ChevronDown, LogOut, ShieldCheck, UserRound } from "lucide-react";
import { api } from "@/lib/client";

export function UserMenu({ name, roleLabel }: { name: string; roleLabel: string }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const close = (e: MouseEvent) => {
      if (!ref.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("click", close);
    return () => document.removeEventListener("click", close);
  }, []);
  return (
    <div className="user-menu" ref={ref}>
      <button type="button" className="user-menu-btn" onClick={() => setOpen((v) => !v)} aria-expanded={open}>
        <UserRound size={18} aria-hidden />
        {name}
        <span className="badge neutral">{roleLabel}</span>
        <ChevronDown size={16} aria-hidden />
      </button>
      {open && (
        <div className="user-menu-pop" role="menu">
          <Link href="/account/security" role="menuitem" onClick={() => setOpen(false)}>
            <ShieldCheck size={16} aria-hidden /> パスワード・2段階認証
          </Link>
          <button
            type="button"
            role="menuitem"
            onClick={async () => {
              await api("/api/auth/logout", { method: "POST" }).catch(() => {});
              // ログイン状態が変わるので、画面の状態をすべて捨てて読み直す
              // eslint-disable-next-line @next/next/no-location-assign-relative-destination
              window.location.assign("/login");
            }}
          >
            <LogOut size={16} aria-hidden /> ログアウト
          </button>
        </div>
      )}
    </div>
  );
}
