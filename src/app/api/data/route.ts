import { deleteAllData } from "@/lib/store";
import { handle } from "@/lib/api";

export async function DELETE() {
  return handle(() => deleteAllData());
}
