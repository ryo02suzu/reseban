import { randomUUID } from "node:crypto";
import { handle, HttpError, readJson } from "@/lib/api";
import { actorOf, requireApiUser } from "@/lib/auth";
import { logAction } from "@/lib/repo/core";
import { listDrafts, saveDraft } from "@/lib/repo/rules";
import { draftRules } from "@/lib/ai/tasks";
import { getAiConfig } from "@/lib/ai/client";

export async function GET() {
  return handle(async () => {
    await requireApiUser(["operator"]);
    return listDrafts();
  });
}

/** 改定通知・疑義解釈の本文から AI がルール案を作る（採用は運営者が判断） */
export async function POST(request: Request) {
  return handle(async () => {
    const s = await requireApiUser(["operator"]);
    if (!getAiConfig().provider) throw new HttpError(400, "AIの接続先が設定されていません（AI_PROVIDER）");
    const { text, title } = await readJson<{ text?: string; title?: string }>(request);
    if (!text?.trim()) throw new HttpError(400, "改定通知・疑義解釈の本文を貼り付けてください");
    if (text.length > 20000) throw new HttpError(400, "本文が長すぎます（2万字まで）。該当部分だけ貼り付けてください。");
    const { drafts, errors } = await draftRules(text);
    const now = new Date().toISOString();
    const created = drafts.map((d) => ({
      id: randomUUID().slice(0, 8),
      createdAt: now,
      sourceTitle: title?.trim() || text.trim().slice(0, 30),
      rule: d.rule,
      aiRationale: d.rationale,
      status: "pending" as const,
    }));
    for (const d of created) await saveDraft(d);
    await logAction(actorOf(s), "ai.draft_rules", "", { created: created.length, errors: errors.length });
    return { drafts: created, errors };
  });
}
