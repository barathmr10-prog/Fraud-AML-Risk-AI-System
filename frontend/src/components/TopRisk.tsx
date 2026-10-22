import type { Row } from "../types";
import { fmtMoney, fmtPct } from "../analytics";
import { COLORS, ProbBar, RiskBadge } from "./ui";

interface Props {
  rows: Row[];
  threshold: { fraud: number; aml: number };
  onSelect: (row: Row) => void;
}

export function TopRisk({ rows, threshold, onSelect }: Props) {
  if (!rows.length) return <div className="chart-empty">No transactions.</div>;
  return (
    <table className="mini-table">
      <thead>
        <tr>
          <th>#</th>
          <th>Type</th>
          <th>Amount</th>
          <th>Fraud</th>
          <th>AML</th>
          <th>Risk</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((r) => (
          <tr key={r.id} onClick={() => onSelect(r)}>
            <td>{r.id}</td>
            <td>{r.type}</td>
            <td>{fmtMoney(r.amount)}</td>
            <td>
              <div className="cell-prob">
                <ProbBar value={r.fraudProb} threshold={threshold.fraud} color={COLORS.fraud} />
                <span>{fmtPct(r.fraudProb, 1)}</span>
              </div>
            </td>
            <td>
              <div className="cell-prob">
                <ProbBar value={r.amlProb} threshold={threshold.aml} color={COLORS.aml} />
                <span>{fmtPct(r.amlProb, 1)}</span>
              </div>
            </td>
            <td><RiskBadge level={r.risk} /></td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
