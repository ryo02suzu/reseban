"use client";

/** API を呼ぶ。エラー時はサーバーの日本語メッセージで例外にする */
export async function api<T = unknown>(url: string, init?: RequestInit & { json?: unknown }): Promise<T> {
  const { json, ...rest } = init ?? {};
  const res = await fetch(url, {
    ...rest,
    headers: json !== undefined ? { "Content-Type": "application/json", ...rest.headers } : rest.headers,
    body: json !== undefined ? JSON.stringify(json) : rest.body,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error((data as { error?: string }).error ?? `エラーが発生しました（${res.status}）`);
  return data as T;
}

export function errorMessage(e: unknown) {
  return e instanceof Error ? e.message : String(e);
}
