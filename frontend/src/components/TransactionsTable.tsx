import { useMemo, useState } from "react";
import type { Row } from "../types";
import { fmtInt, fmtMoney, fmtPct } from "../analytics";
import { COLORS, FlagBadge, ProbBar, RiskBadge } from "./ui";

type Filter = "all" | "either" | "fraud" | "aml" | "both";
type SortKey = "id" | "amount" | "fraudProb" | "amlProb" | "risk";

const PAGE_SIZE = 25;
const RISK_ORDER = { Critical: 3, High: 2, Medium: 1, Low: 0 } as const;

interface Props {
  rows: Row[];
  threshold: { fraud: number; aml: number };
  onSelect: (row: Row) => void;
}

export function TransactionsTable({ rows, threshold, onSelect }: Props) {
  const [filter, setFilter] = useState<Filter>("either");
  const [query, setQuery] = useState("");
  const [sort, setSort] = useState<{ key: SortKey; dir: 1 | -1 }>({ key: "risk", dir: -1 });
  const [page, setPage] = useState(0);

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    const filtered = rows.filter((r) => {
      if (filter === "fraud" && !r.fraudFlag) return false;
      if (filter === "aml" && !r.amlFlag) return false;
      if (filter === "both" && !(r.fraudFlag && r.amlFlag)) return false;
      if (filter === "either" && !(r.fraudFlag || r.amlFlag)) return false;
      if (q && !Object.values(r.raw).some((v) => String(v).toLowerCase().includes(q))) return false;
      return true;
    });
    const value = (r: Row) => (sort.key === "risk" ? RISK_ORDER[r.risk] * 10 + Math.max(r.fraudProb, r.amlProb) : r[sort.key]);
    return filtered.sort((a, b) => (value(a) - value(b)) * sort.dir);
  }, [rows, filter, query, sort]);

  const pages = Math.max(1, Math.ceil(visible.length / PAGE_SIZE));
  const current = Math.min(page, pages - 1);
  const slice = visible.slice(current * PAGE_SIZE, (current + 1) * PAGE_SIZE);

  const header = (key: SortKey, label: string) => (
    <th className="sortable" onClick={() => { setSort((s) => ({ key, dir: s.key === key ? (-s.dir as 1 | -1) : -1 })); setPage(0); }}>
      {label} {sort.key === key ? (sort.dir === -1 ? "\u25BC" : "\u25B2") : ""}
    </th>
  );

  return (
    <section className="card">
      <div className="toolbar">
        <div className="seg">
          {([["either", "Flagged"], ["fraud", "Fraud"], ["aml", "AML"], ["both", "Both"], ["all", "All"]] as [Filter, string][]).map(([k, label]) => (
            <button key={k} className={filter === k ? "seg-on" : ""} onClick={() => { setFilter(k); setPage(0); }}>{label}</button>
          ))}
        </div>
        <input className="search" placeholder="Search any column (account, type, currency...)" value={query} onChange={(e) => { setQuery(e.target.value); setPage(0); }} />
        <span className="count">{fmtInt(visible.length)} rows</span>
      </div>

      <div className="table-wrap">
        <table className="data-table">
          <thead>
            <tr>
              {header("id", "#")}
              <th>Type</th>
              {header("amount", "Amount")}
              {header("fraudProb", "Fraud score")}
              <th>Fraud</th>
              {header("amlProb", "AML score")}
              <th>AML</th>
              {header("risk", "Risk")}
            </tr>
          </thead>
          <tbody>
            {slice.map((r) => (
              <tr key={r.id} onClick={() => onSelect(r)}>
                <td>{r.id}</td>
                <td>{r.type}</td>
                <td>{fmtMoney(r.amount)}</td>
                <td>
                  <div className="cell-prob">
                    <ProbBar value={r.fraudProb} threshold={threshold.fraud} color={COLORS.fraud} />
                    <span>{fmtPct(r.fraudProb, 2)}</span>
                  </div>
                </td>
                <td><FlagBadge flagged={r.fraudFlag} yes="Fraud" no="Legitimate" /></td>
                <td>
                  <div className="cell-prob">
                    <ProbBar value={r.amlProb} threshold={threshold.aml} color={COLORS.aml} />
                    <span>{fmtPct(r.amlProb, 2)}</span>
                  </div>
                </td>
                <td><FlagBadge flagged={r.amlFlag} yes="Suspicious" no="Normal" /></td>
                <td><RiskBadge level={r.risk} /></td>
              </tr>
            ))}
            {!slice.length && (
              <tr><td colSpan={8} className="chart-empty">No transactions match the current filter.</td></tr>
            )}
          </tbody>
        </table>
      </div>

      <div className="pager">
        <button disabled={current === 0} onClick={() => setPage(current - 1)}>Previous</button>
        <span>Page {current + 1} of {fmtInt(pages)}</span>
        <button disabled={current >= pages - 1} onClick={() => setPage(current + 1)}>Next</button>
      </div>
    </section>
  );
}
