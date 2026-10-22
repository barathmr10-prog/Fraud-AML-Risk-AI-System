import { useMemo } from "react";
import type { Analysis, Row } from "../types";
import { fmtInt, fmtMoney, fmtPct, groupStats, histogram, hourlyStats, mean } from "../analytics";
import { ProbHistogram, RateBar, StackedGroupBar } from "./charts";
import { TopRisk } from "./TopRisk";
import { COLORS, Card, Kpi } from "./ui";

const str = (r: Row, key: string) => String(r.raw[key] ?? "Unknown");

export function AmlView({ analysis, onSelect }: { analysis: Analysis; onSelect: (r: Row) => void }) {
  const { rows, fraudMetrics: fm, amlMetrics: am } = analysis;

  const d = useMemo(() => {
    const flagged = rows.filter((r) => r.amlFlag);
    const amountOf = (r: Row) => Number(r.raw["Amount"]) || 0;
    const byLocation = groupStats(rows, (r) => str(r, "Sender_bank_location"), (r) => r.amlFlag, 10);
    return {
      bins: histogram(rows.map((r) => r.amlProb), am.threshold),
      byPayment: groupStats(rows, (r) => str(r, "Payment_type"), (r) => r.amlFlag, 10),
      byLocation,
      byCurrency: groupStats(rows, (r) => str(r, "Payment_currency"), (r) => r.amlFlag, 10),
      hourly: hourlyStats(rows),
      flaggedAmount: flagged.reduce((s, r) => s + amountOf(r), 0),
      avgFlaggedProb: mean(flagged.map((r) => r.amlProb)),
      crossBorder: flagged.filter((r) => str(r, "Sender_bank_location") !== str(r, "Receiver_bank_location")).length,
      top: [...rows].sort((a, b) => b.amlProb - a.amlProb).slice(0, 10),
    };
  }, [rows, am.threshold]);

  return (
    <div className="stack">
      <div className="kpi-grid">
        <Kpi label="AML suspicious" value={fmtInt(am.aml_count)} hint={`of ${fmtInt(am.total_transactions)} transactions`} color={COLORS.aml} />
        <Kpi label="Suspicious rate" value={`${am.aml_percentage}%`} color={COLORS.aml} />
        <Kpi label="Suspicious amount" value={fmtMoney(d.flaggedAmount)} hint="Sum of flagged `Amount`" color={COLORS.aml} />
        <Kpi label="Cross-border flagged" value={fmtInt(d.crossBorder)} hint="Sender and receiver locations differ" color={COLORS.info} />
        <Kpi label="Avg flagged confidence" value={d.avgFlaggedProb ? fmtPct(d.avgFlaggedProb, 1) : "-"} color={COLORS.info} />
        <Kpi label="Decision threshold" value={fmtPct(am.threshold, 0)} hint="Suspicious if probability >= threshold" color={COLORS.muted} />
      </div>

      <div className="grid-2">
        <Card title="AML probability distribution" subtitle="Count per probability bucket (square-root scale). Amber buckets are above the threshold.">
          <ProbHistogram bins={d.bins} threshold={am.threshold} flaggedColor={COLORS.aml} />
        </Card>
        <Card title="Transactions by payment type" subtitle="Normal vs suspicious for each payment type">
          <StackedGroupBar data={d.byPayment} flaggedLabel="Suspicious" normalLabel="Normal" flaggedColor={COLORS.aml} />
        </Card>
      </div>

      <div className="grid-2">
        <Card title="Suspicious rate by sender location" subtitle="Top 10 locations by volume">
          <RateBar data={[...d.byLocation].sort((a, b) => b.rate - a.rate)} color={COLORS.aml} />
        </Card>
        <Card title="Suspicious rate by payment currency" subtitle="Top 10 currencies by volume">
          <RateBar data={[...d.byCurrency].sort((a, b) => b.rate - a.rate)} color={COLORS.aml} />
        </Card>
      </div>

      <Card title="Activity by hour of day" subtitle="Normal vs suspicious transactions per hour">
        <StackedGroupBar data={d.hourly} flaggedLabel="Suspicious" normalLabel="Normal" flaggedColor={COLORS.aml} />
      </Card>

      <Card title="Highest AML probabilities" subtitle="Click a row for details">
        <TopRisk rows={d.top} threshold={{ fraud: fm.threshold, aml: am.threshold }} onSelect={onSelect} />
      </Card>
    </div>
  );
}
