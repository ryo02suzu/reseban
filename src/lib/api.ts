import "server-only";
import { DEMO_LOCKED_MESSAGE, DEMO_MODE } from "./demo/mode";

/** Route Handler 共通：例外を日本語メッセージの JSON にする */
export async function handle<T>(fn: () => Promise<T> | T): Promise<Response> {
  try {
    const data = await fn();
    if (data instanceof Response) return data;
    return Response.json(data ?? { ok: true }, { headers: { "Cache-Control": "no-store" } });
  } catch (e) {
    if (e instanceof HttpError) return Response.json({ error: e.message }, { status: e.status });
    if (e instanceof Error && isUserError(e)) return Response.json({ error: e.message }, { status: 400 });
    console.error(e);
    return Response.json({ error: "サーバーでエラーが発生しました。時間をおいて再度お試しください。" }, { status: 500 });
  }
}

/** 利用者に見せてよいエラー（日本語メッセージ）かどうか */
function isUserError(e: Error) {
  return /[぀-ヿ一-鿿]/.test(e.message);
}

export class HttpError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}

/** デモ環境で、他の閲覧者の見え方を壊す操作を止める */
export function forbidInDemo() {
  if (DEMO_MODE) throw new HttpError(400, DEMO_LOCKED_MESSAGE);
}

export function notFound(what = "データ"): never {
  throw new HttpError(404, `${what}が見つかりません`);
}

export async function fileBytes(v: FormDataEntryValue | null, maxBytes = 30 * 1024 * 1024): Promise<Uint8Array | null> {
  if (!v || typeof v === "string") return null;
  if (v.size > maxBytes) throw new HttpError(413, `ファイルが大きすぎます（${Math.round(maxBytes / 1024 / 1024)}MBまで）`);
  return new Uint8Array(await v.arrayBuffer());
}

export async function readJson<T = Record<string, unknown>>(req: Request): Promise<T> {
  try {
    return (await req.json()) as T;
  } catch {
    throw new HttpError(400, "リクエストの形式が正しくありません");
  }
}
