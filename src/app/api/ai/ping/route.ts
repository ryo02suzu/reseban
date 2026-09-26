import { handle } from "@/lib/api";
import { pingAi } from "@/lib/ai/tasks";

export async function POST() {
  return handle(async () => ({ model: await pingAi() }));
}
