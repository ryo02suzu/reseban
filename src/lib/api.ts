import "server-only";

/** Route Handler 共通：例外を日本語メッセージの JSON にする */
export async function handle<T>(fn: () => Promise<T> | T): Promise<Response> {
  try {
    const data = await fn();
    return Response.json(data ?? { ok: true });
  } catch (e) {
    const status = e instanceof HttpError ? e.status : 400;
    const message = e instanceof Error ? e.message : String(e);
    if (!(e instanceof HttpError)) console.error(e);
    return Response.json({ error: message }, { status });
  }
}

export class HttpError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}

export function notFound(what = "データ"): never {
  throw new HttpError(404, `${what}が見つかりません`);
}

export async function fileBytes(v: FormDataEntryValue | null): Promise<Uint8Array | null> {
  if (!v || typeof v === "string") return null;
  return new Uint8Array(await v.arrayBuffer());
}
