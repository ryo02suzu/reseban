import Link from "next/link";
import { CheckCircle2, Circle } from "lucide-react";
import { CheckClient } from "@/components/CheckClient";
import { requireClinicPage } from "@/lib/auth";
import { DEMO_MODE } from "@/lib/demo/mode";
import { getMasterIndex } from "@/lib/repo/core";
import { getClaimHistory } from "@/lib/repo/rules";
import { listRuns, listStoredMonths } from "@/lib/repo/runs";

export default async function CheckPage() {
  const s = await requireClinicPage();
  const [runs, months, claims, master] = await Promise.all([
    listRuns(s.clinic.id),
    listStoredMonths(s.clinic.id),
    getClaimHistory(s.clinic.id),
    getMasterIndex(),
  ]);
  const isOwner = s.user.role === "owner";
  // はじめにやること（すべて済めば表示しない）
  const steps = [
    { done: s.clinic.facilityCodes.length > 0, label: "施設基準の届出を登録する", href: "/settings", owner: true },
    { done: months.length >= 6, label: "当月と過去6ヶ月分のレセ電を取り込む（紙の場合は紙レセプト入力）", href: "/" },
    { done: claims.length > 0, label: "過去の返戻・査定を記録する（優先順位づけと答え合わせ）", href: "/claims" },
    { done: s.user.totpEnabled, label: "2段階認証を設定する", href: "/account/security" },
  ].filter((x) => !x.owner || isOwner);
  const showSteps = !DEMO_MODE && steps.some((x) => !x.done);
  return (
    <>
      <div className="page-head">
        <div>
          <h1>チェック（取込）</h1>
          <p>レセ電ファイルを取り込み、点検を開始します。</p>
        </div>
      </div>
      {!master.loaded.has("shinryo") && (
        <p className="notice error">公式マスターがまだ取り込まれていないため、正しく判定できません。運営者に連絡してください。</p>
      )}
      {showSteps && (
        <section className="card getting-started">
          <h2>はじめにやること</h2>
          <ul>
            {steps.map((x) => (
              <li key={x.label} className={x.done ? "done" : undefined}>
                {x.done ? <CheckCircle2 size={18} aria-hidden /> : <Circle size={18} aria-hidden />}
                {x.done || x.href === "/" ? x.label : <Link href={x.href}>{x.label}</Link>}
              </li>
            ))}
          </ul>
        </section>
      )}
      <CheckClient runs={runs} storedMonths={months} canDelete={isOwner} />
    </>
  );
}
