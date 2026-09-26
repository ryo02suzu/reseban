import { rerunAudit } from "@/lib/audit";
import { handle, notFound } from "@/lib/api";

type Ctx = { params: Promise<{ id: string }> };

export async function POST(_: Request, { params }: Ctx) {
  const { id } = await params;
  return handle(() => ({ id: (rerunAudit(id) ?? notFound("チェック結果")).id }));
}
