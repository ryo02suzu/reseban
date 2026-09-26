import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

/**
 * かんたんなログイン（Basic 認証）。
 * BASIC_AUTH_USER と BASIC_AUTH_PASSWORD を設定すると有効になる。
 * 院外のサーバーに置くときは必ず設定し、HTTPS で使うこと。
 */
export function proxy(request: NextRequest) {
  const user = process.env.BASIC_AUTH_USER;
  const pass = process.env.BASIC_AUTH_PASSWORD;
  if (!user || !pass) return NextResponse.next();

  const header = request.headers.get("authorization") ?? "";
  const [scheme, encoded] = header.split(" ");
  if (scheme === "Basic" && encoded) {
    const [u, ...rest] = atob(encoded).split(":");
    if (u === user && rest.join(":") === pass) return NextResponse.next();
  }
  return new NextResponse("ログインが必要です", {
    status: 401,
    headers: { "WWW-Authenticate": 'Basic realm="reseban", charset="UTF-8"' },
  });
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|icon.png).*)"],
};
