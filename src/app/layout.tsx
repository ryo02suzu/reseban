import type { Metadata } from "next";
import Link from "next/link";
import { connection } from "next/server";
import { Building2 } from "lucide-react";
import { Nav } from "@/components/Nav";
import { getSettings } from "@/lib/store";
import "./globals.css";

export const metadata: Metadata = {
  title: "レセ番 — 歯科レセプト点検",
  description: "レセ電データから返戻・査定リスクと算定漏れを見つける",
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  await connection();
  const clinicName = getSettings().clinicName;
  return (
    <html lang="ja">
      <body>
        <div className="app">
          <aside className="sidebar">
            <Link href="/" className="logo" aria-label="レセ番 トップへ">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src="/logo.png" alt="レセ番" />
            </Link>
            <Nav />
          </aside>
          <div className="main">
            <header className="topbar">
              <Building2 size={18} aria-hidden />
              <span>{clinicName || "医院名未設定"}</span>
            </header>
            <main className="content">{children}</main>
          </div>
        </div>
      </body>
    </html>
  );
}
