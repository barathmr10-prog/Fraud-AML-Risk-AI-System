import { useMemo } from "react";
import { CartesianGrid, ReferenceLine, ResponsiveContainer, Scatter, ScatterChart, Tooltip, XAxis, YAxis, ZAxis } from "recharts";
import type { Analysis, Row } from "../types";
import { fmtInt, fmtMoney, fmtPct, groupStats, histogram, mean, samplePoints } from "../analytics";
import { ProbHistogram, RateBar, StackedGroupBar } from "./charts";
import { TopRisk } from "./TopRisk";
import { COLORS, Card, Kpi } from "./ui";

export function FraudView({ analysis, onSelect }: { analysis: Analysis; onSelect: (r: Row) => void }) {
  const { rows, fraudMetrics: fm, amlMetrics: am } = analysis;

  const d = useMemo(() => {
    const flagged = rows.filter((r) => r.fraudFlag);
    const byType = groupStats(rows, (r) => r.type, (r) => r.fraudFlag, 12);
    const points = samplePoints(rows).filter((r) => r.amount > 0);
    return {
      bins: histogram(rows.map((r) => r.fraudProb), fm.threshold),
      byType,
      flaggedAmount: flagged.reduce((s, r) => s + r.amount, 0),
      avgFlaggedProb: mean(flagged.map((r) => r.fraudProb)),
      ok: points.filter((r) => !r.fraudFlag),
      bad: points.filter((r) => r.fraudFlag),
      top: [...rows].sort((a, b) => b.fraudProb - a.fraudProb).slice(0, 10),
    };
  }, [rows, fm.threshold]);

  return (
    <div className="stack">
      <div className="kpi-grid">
        <Kpi label="Fraud flagged" value={fmtInt(fm.fraud_count)} hint={`of ${fmtInt(fm.total_transactions)} transactions`} color={COLORS.fraud} />
        <Kpi label="Fraud rate" value={`${fm.fraud_percentage}%`} color={COLORS.fraud} />
        <Kpi label="Flagged amount" value={fmtMoney(d.flaggedAmount)} color={COLORS.fraud} />
        <Kpi label="Avg flagged confidence" value={d.avgFlaggedProb ? fmtPct(d.avgFlaggedProb, 1) : "-"} color={COLORS.info} />
        <Kpi label="Decision threshold" value={fmtPct(fm.threshold, 0)} hint="Fraud if probability >= threshold" color={COLORS.muted} />
      </div>

      <div className="grid-2">
        <Card title="Fraud probability distribution" subtitle="Count per probability bucket (square-root scale). Red buckets are above the threshold.">
          <ProbHistogram bins={d.bins} threshold={fm.threshold} flaggedColor={COLORS.fraud} />
        </Card>
        <Card title="Transactions by type" subtitle="Legitimate vs flagged for each transaction type">
          <StackedGroupBar data={d.byType} flaggedLabel="Fraud" normalLabel="Legitimate" flaggedColor={COLORS.fraud} />
        </Card>
      </div>

      <div className="grid-2">
        <Card title="Fraud rate by type" subtitle="Share of each type that the model flags">
          <RateBar data={[...d.byType].sort((a, b) => b.rate - a.rate)} color={COLORS.fraud} />
        </Card>
        <Card title="Amount vs fraud probability" subtitle="Log-scale amount; flagged transactions in red">
          <ResponsiveContainer width="100%" height={Math.max(240, d.byType.length * 34)}>
            <ScatterChart margin={{ top: 12, right: 16, left: 0, bottom: 24 }}>
              <CartesianGrid stroke={COLORS.grid} />
              <XAxis type="number" dataKey="amount" scale="log" domain={["auto", "auto"]} tickFormatter={fmtMoney} tick={{ fontSize: 11 }} label={{ value: "Amount", position: "insideBottom", offset: -12, fontSize: 12 }} />
              <YAxis type="number" dataKey="fraudProb" domain={[0, 1]} tickFormatter={(v) => fmtPct(v, 0)} tick={{ fontSize: 11 }} />
              <ZAxis range={[24, 24]} />
              <Tooltip formatter={(v, n) => (n === "amount" ? fmtMoney(Number(v)) : fmtPct(Number(v), 2))} />
              <ReferenceLine y={fm.threshold} stroke="#0f172a" strokeDasharray="4 3" />
              <Scatter name="Legitimate" data={d.ok} fill={COLORS.ok} fillOpacity={0.45} />
              <Scatter name="Fraud" data={d.bad} fill={COLORS.fraud} fillOpacity={0.8} />
            </ScatterChart>
          </ResponsiveContainer>
        </Card>
      </div>

      <Card title="Highest fraud probabilities" subtitle="Click a row for details">
        <TopRisk rows={d.top} threshold={{ fraud: fm.threshold, aml: am.threshold }} onSelect={onSelect} />
      </Card>
    </div>
  );
}
