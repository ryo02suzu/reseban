import { deleteRun, getRun } from "@/lib/store";
import { handle, notFound } from "@/lib/api";

type Ctx = { params: Promise<{ id: string }> };

export async function GET(_: Request, { params }: Ctx) {
  const { id } = await params;
  return handle(() => getRun(id) ?? notFound("チェック結果"));
}

export async function DELETE(_: Request, { params }: Ctx) {
  const { id } = await params;
  return handle(() => deleteRun(id));
}
