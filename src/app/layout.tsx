import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "レセ番 — 歯科レセプト点検",
  description: "レセ電データから返戻・査定リスクと算定漏れを見つける",
  robots: { index: false, follow: false },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ja">
      <body>{children}</body>
    </html>
  );
}
