import { runDemoAudit } from "@/lib/audit";
import { handle } from "@/lib/api";

export async function POST() {
  return handle(() => ({ id: runDemoAudit().id }));
}
