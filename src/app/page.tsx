import { HomeClient } from "@/components/HomeClient";
import { mockRuns } from "@/lib/mock";

export default function Home() {
  return (
    <>
      <div className="page-head">
        <div>
          <h1>レセプトチェック</h1>
          <p>当月分＋過去6ヶ月分のレセ電を入れて「チェック開始」を押すだけ。</p>
        </div>
      </div>
      <HomeClient initialRuns={mockRuns} />
    </>
  );
}
