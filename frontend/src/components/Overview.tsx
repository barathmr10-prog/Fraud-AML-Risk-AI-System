import { useMemo } from "react";
import { CartesianGrid, ReferenceLine, ResponsiveContainer, Scatter, ScatterChart, Tooltip, XAxis, YAxis, ZAxis, Legend } from "recharts";
import type { Analysis, RiskLevel, Row } from "../types";
import { fmtInt, fmtMoney, fmtPct, mean, samplePoints } from "../analytics";
import { Donut } from "./charts";
import { TopRisk } from "./TopRisk";
import { COLORS, Card, Kpi, RISK_COLORS } from "./ui";

const LEVELS: RiskLevel[] = ["Critical", "High", "Medium", "Low"];

export function Overview({ analysis, onSelect }: { analysis: Analysis; onSelect: (r: Row) => void }) {
  const { rows, fraudMetrics: fm, amlMetrics: am } = analysis;

  const stats = useMemo(() => {
    const tiers = Object.fromEntries(LEVELS.map((l) => [l, 0])) as Record<RiskLevel, number>;
    let flaggedAmount = 0;
    for (const r of rows) {
      tiers[r.risk]++;
      if (r.fraudFlag) flaggedAmount += r.amount;
    }
    return {
      tiers,
      flaggedAmount,
      avgFraud: mean(rows.map((r) => r.fraudProb)),
      avgAml: mean(rows.map((r) => r.amlProb)),
      top: [...rows].sort((a, b) => Math.max(b.fraudProb, b.amlProb) - Math.max(a.fraudProb, a.amlProb)).slice(0, 10),
      scatter: samplePoints(rows),
    };
  }, [rows]);

  return (
    <div className="stack">
      <div className="kpi-grid">
        <Kpi label="Transactions scored" value={fmtInt(fm.total_transactions)} hint={analysis.filename} color={COLORS.info} />
        <Kpi label="Fraud flagged" value={fmtInt(fm.fraud_count)} hint={`${fm.fraud_percentage}% of total`} color={COLORS.fraud} />
        <Kpi label="AML suspicious" value={fmtInt(am.aml_count)} hint={`${am.aml_percentage}% of total`} color={COLORS.aml} />
        <Kpi label="Flagged by both" value={fmtInt(stats.tiers.Critical)} hint="Critical risk" color={RISK_COLORS.Critical} />
        <Kpi label="Fraud-flagged amount" value={fmtMoney(stats.flaggedAmount)} hint="Sum of flagged `amount`" color={COLORS.fraud} />
        <Kpi label="Avg fraud / AML score" value={`${fmtPct(stats.avgFraud, 2)} / ${fmtPct(stats.avgAml, 2)}`} hint="Mean model probability" color={COLORS.muted} />
      </div>

      <div className="grid-3">
        <Card title="Fraud model" subtitle={`Decision threshold ${fmtPct(fm.threshold, 0)}`}>
          <Donut
            data={[
              { name: "Legitimate", value: fm.legitimate_count, color: COLORS.ok },
              { name: "Fraud", value: fm.fraud_count, color: COLORS.fraud },
            ]}
            centerValue={`${fm.fraud_percentage}%`}
            centerLabel="flagged"
          />
        </Card>
        <Card title="AML model" subtitle={`Decision threshold ${fmtPct(am.threshold, 0)}`}>
          <Donut
            data={[
              { name: "Normal", value: am.normal_count, color: COLORS.ok },
              { name: "Suspicious", value: am.aml_count, color: COLORS.aml },
            ]}
            centerValue={`${am.aml_percentage}%`}
            centerLabel="suspicious"
          />
        </Card>
        <Card title="Combined risk tiers" subtitle="Critical = both models flag it">
          <Donut
            data={LEVELS.map((l) => ({ name: l, value: stats.tiers[l], color: RISK_COLORS[l] }))}
            centerValue={fmtInt(stats.tiers.Critical + stats.tiers.High)}
            centerLabel="need review"
          />
        </Card>
      </div>

      <Card title="Fraud score vs AML score" subtitle={`Each dot is a transaction${rows.length > stats.scatter.length ? ` (sample of ${fmtInt(stats.scatter.length)}; all flagged kept)` : ""}. Dashed lines mark each model's threshold.`}>
        <ResponsiveContainer width="100%" height={380}>
          <ScatterChart margin={{ top: 12, right: 24, left: 0, bottom: 24 }}>
            <CartesianGrid stroke={COLORS.grid} />
            <XAxis type="number" dataKey="fraudProb" domain={[0, 1]} name="Fraud probability" tickFormatter={(v) => fmtPct(v, 0)} label={{ value: "Fraud probability", position: "insideBottom", offset: -12, fontSize: 12 }} />
            <YAxis type="number" dataKey="amlProb" domain={[0, 1]} name="AML probability" tickFormatter={(v) => fmtPct(v, 0)} label={{ value: "AML probability", angle: -90, position: "insideLeft", fontSize: 12 }} />
            <ZAxis range={[28, 28]} />
            <Tooltip cursor={{ strokeDasharray: "3 3" }} formatter={(v) => fmtPct(Number(v), 2)} />
            <Legend verticalAlign="top" />
            <ReferenceLine x={fm.threshold} stroke={COLORS.fraud} strokeDasharray="5 4" />
            <ReferenceLine y={am.threshold} stroke={COLORS.aml} strokeDasharray="5 4" />
            {[...LEVELS].reverse().map((l) => (
              <Scatter key={l} name={l} data={stats.scatter.filter((r) => r.risk === l)} fill={RISK_COLORS[l]} fillOpacity={0.7} onClick={(d) => {
                // Recharts passes the datum either directly or under `payload`.
                const p = d as { id?: number; payload?: { id?: number } };
                const id = p.id ?? p.payload?.id;
                if (id) onSelect(rows[id - 1]);
              }} />
            ))}
          </ScatterChart>
        </ResponsiveContainer>
      </Card>

      <Card title="Top 10 highest-risk transactions" subtitle="Ranked by the higher of the two scores. Click a row for details.">
        <TopRisk rows={stats.top} threshold={{ fraud: fm.threshold, aml: am.threshold }} onSelect={onSelect} />
      </Card>
    </div>
  );
}
