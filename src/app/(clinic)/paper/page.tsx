import { PaperClient } from "@/components/PaperClient";
import { requireClinicPage } from "@/lib/auth";
import { DEMO_MODE } from "@/lib/demo/mode";
import { listPaper, paperMonths } from "@/lib/repo/paper";

export const metadata = { title: "紙レセプト入力 | レセ番" };

/** 前月（紙レセプトは前月診療分を翌月に請求するため） */
function lastMonth() {
  const d = new Date();
  d.setDate(1);
  d.setMonth(d.getMonth() - 1);
  return `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, "0")}`;
}

export default async function PaperPage() {
  const s = await requireClinicPage();
  const months = await paperMonths(s.clinic.id);
  const month = months.at(-1)?.month ?? lastMonth();
  return <PaperClient initialMonth={month} initialMonths={months} initialReceipts={await listPaper(s.clinic.id, month)} demo={DEMO_MODE} />;
}
