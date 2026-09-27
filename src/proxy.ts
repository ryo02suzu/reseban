import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

/**
 * すべてのリクエストの前に走る処理。
 *  - 書き込み系の API は、同じサイトからのリクエストだけを受け付ける（CSRF 対策）
 *  - ログイン用 Cookie が無ければ、画面はログインへ（最終的な認可は各ページ・API で行う）
 */
const PUBLIC_PAGES = [/^\/login(\/|$)/, /^\/invite\//, /^\/legal\//];

export function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const method = request.method.toUpperCase();

  if (pathname.startsWith("/api/")) {
    if (!["GET", "HEAD", "OPTIONS"].includes(method)) {
      const origin = request.headers.get("origin");
      const site = request.headers.get("sec-fetch-site");
      const host = request.headers.get("x-forwarded-host") ?? request.headers.get("host");
      const sameOrigin = origin ? safeHost(origin) === host : site === "same-origin" || site === null;
      if (!sameOrigin || site === "cross-site") {
        return NextResponse.json({ error: "不正なリクエストです" }, { status: 403 });
      }
    }
    return NextResponse.next();
  }

  if (!PUBLIC_PAGES.some((r) => r.test(pathname)) && !request.cookies.has("rb_session")) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    url.search = "";
    return NextResponse.redirect(url);
  }
  return NextResponse.next();
}

function safeHost(origin: string) {
  try {
    return new URL(origin).host;
  } catch {
    return "";
  }
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|icon.png|logo.png|favicon.ico).*)"],
};
