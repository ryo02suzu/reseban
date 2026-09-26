"use client";

import Link from "next/link";
import type { AuditRunListItem } from "@/lib/types";
import { formatMonth, formatYen, formatDateTime } from "@/lib/format";

export function RunHistory({
  runs,
  onDelete,
}: {
  runs: AuditRunListItem[];
  onDelete: (id: string) => void;
}) {
  return (
    <section className="card">
      <h2>これまでのチェック</h2>
      {runs.length === 0 ? (
        <p className="empty">まだチェックしていません</p>
      ) : (
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>診療月</th>
                <th>実行日時</th>
                <th className="num">レセ件数</th>
                <th className="num">返戻リスク</th>
                <th className="num">査定リスク</th>
                <th className="num">算定漏れ</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {runs.map((r) => (
                <tr key={r.id}>
                  <td>
                    {formatMonth(r.targetMonth)}
                    {r.demo && (
                      <span className="badge outline" style={{ marginLeft: 6 }}>
                        サンプル
                      </span>
                    )}
                  </td>
                  <td className="muted">{formatDateTime(r.createdAt)}</td>
                  <td className="num">{r.summary.receiptCount}</td>
                  <td className="num">{r.summary.henreiCount}件</td>
                  <td className="num">{formatYen(r.summary.sateiYen)}</td>
                  <td className="num">{formatYen(r.summary.moreYen)}</td>
                  <td>
                    <div className="row" style={{ justifyContent: "flex-end", flexWrap: "nowrap" }}>
                      <Link className="btn btn-sm" href={`/audits/${r.id}`}>
                        開く
                      </Link>
                      <button
                        type="button"
                        className="btn btn-sm btn-danger"
                        onClick={() => {
                          if (confirm("このチェック結果を削除しますか？")) onDelete(r.id);
                        }}
                      >
                        削除
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
