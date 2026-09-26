import { randomUUID } from "node:crypto";
import { getDrafts, getSettings, saveDrafts } from "@/lib/store";
import { handle } from "@/lib/api";
import { draftRules } from "@/lib/ai/tasks";

export async function POST(request: Request) {
  const { text, title } = (await request.json()) as { text?: string; title?: string };
  return handle(async () => {
    if (!getSettings().aiEnabled) throw new Error("設定画面でAI機能をONにしてください");
    if (!text?.trim()) throw new Error("改定通知・疑義解釈の本文を貼り付けてください");
    if (text.length > 20000) throw new Error("本文が長すぎます（2万字まで）。該当部分だけ貼り付けてください。");
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
    saveDrafts([...created, ...getDrafts()]);
    return { drafts: created, errors };
  });
}
