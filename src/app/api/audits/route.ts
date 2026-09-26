import { runAudit } from "@/lib/audit";
import { fileBytes, handle } from "@/lib/api";

export async function POST(request: Request) {
  return handle(async () => {
    const form = await request.formData();
    const current = await fileBytes(form.get("current"));
    if (!current) throw new Error("当月のファイルを選んでください");
    const history: Uint8Array[] = [];
    for (const v of form.getAll("history")) {
      const b = await fileBytes(v);
      if (b) history.push(b);
    }
    const run = runAudit({ current, history });
    return { id: run.id };
  });
}
