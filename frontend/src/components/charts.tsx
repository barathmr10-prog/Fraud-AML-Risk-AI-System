import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Pie,
  PieChart,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import type { Bin, GroupStat } from "../analytics";
import { fmtInt, fmtPct } from "../analytics";
import { COLORS, ChartEmpty } from "./ui";

export function Donut({ data, centerLabel, centerValue }: { data: { name: string; value: number; color: string }[]; centerLabel: string; centerValue: string }) {
  return (
    <div className="donut">
      <ResponsiveContainer width="100%" height={240}>
        <PieChart>
          <Pie data={data} dataKey="value" nameKey="name" innerRadius={62} outerRadius={92} paddingAngle={2} stroke="none">
            {data.map((d) => (
              <Cell key={d.name} fill={d.color} />
            ))}
          </Pie>
          <Tooltip formatter={(v) => fmtInt(Number(v))} />
          <Legend verticalAlign="bottom" iconType="circle" />
        </PieChart>
      </ResponsiveContainer>
      <div className="donut-center">
        <strong>{centerValue}</strong>
        <span>{centerLabel}</span>
      </div>
    </div>
  );
}

export function ProbHistogram({ bins, threshold, flaggedColor, okColor = COLORS.ok }: { bins: Bin[]; threshold: number; flaggedColor: string; okColor?: string }) {
  return (
    <ResponsiveContainer width="100%" height={280}>
      <BarChart data={bins} margin={{ top: 16, right: 12, left: 0, bottom: 0 }}>
        <CartesianGrid stroke={COLORS.grid} vertical={false} />
        <XAxis dataKey="label" tick={{ fontSize: 10 }} interval={1} angle={-35} textAnchor="end" height={54} />
        <YAxis scale="sqrt" tick={{ fontSize: 11 }} tickFormatter={fmtInt} />
        <Tooltip formatter={(v) => [fmtInt(Number(v)), "Transactions"]} labelFormatter={(l) => `Probability ${l}`} />
        <Bar dataKey="count" radius={[3, 3, 0, 0]}>
          {bins.map((b) => (
            <Cell key={b.label} fill={b.flagged ? flaggedColor : okColor} />
          ))}
        </Bar>
        <ReferenceLine
          x={bins.find((b) => b.start + 0.05 > threshold)?.label}
          stroke="#0f172a"
          strokeDasharray="4 3"
          label={{ value: `threshold ${fmtPct(threshold, 0)}`, position: "top", fontSize: 11 }}
        />
      </BarChart>
    </ResponsiveContainer>
  );
}

export function StackedGroupBar({ data, flaggedLabel, normalLabel, flaggedColor, layout = "horizontal" }: { data: GroupStat[]; flaggedLabel: string; normalLabel: string; flaggedColor: string; layout?: "horizontal" | "vertical" }) {
  if (!data.length) return <ChartEmpty message="No data available for this breakdown." />;
  const vertical = layout === "vertical";
  return (
    <ResponsiveContainer width="100%" height={vertical ? Math.max(240, data.length * 34) : 280}>
      <BarChart data={data} layout={layout} margin={{ top: 8, right: 16, left: vertical ? 24 : 0, bottom: 0 }}>
        <CartesianGrid stroke={COLORS.grid} horizontal={vertical ? false : true} vertical={vertical} />
        {vertical ? (
          <>
            <XAxis type="number" tick={{ fontSize: 11 }} tickFormatter={fmtInt} />
            <YAxis type="category" dataKey="name" width={100} tick={{ fontSize: 11 }} />
          </>
        ) : (
          <>
            <XAxis dataKey="name" tick={{ fontSize: 11 }} />
            <YAxis tick={{ fontSize: 11 }} tickFormatter={fmtInt} />
          </>
        )}
        <Tooltip
          formatter={(v, n) => [fmtInt(Number(v)), n]}
          labelFormatter={(l, payload) => {
            const g = payload?.[0]?.payload as GroupStat | undefined;
            return g ? `${l} - ${fmtPct(g.rate, 2)} flagged` : String(l);
          }}
        />
        <Legend iconType="circle" />
        <Bar dataKey="normal" name={normalLabel} stackId="a" fill={COLORS.ok} />
        <Bar dataKey="flagged" name={flaggedLabel} stackId="a" fill={flaggedColor} />
      </BarChart>
    </ResponsiveContainer>
  );
}

export function RateBar({ data, color, layout = "vertical" }: { data: GroupStat[]; color: string; layout?: "horizontal" | "vertical" }) {
  if (!data.length) return <ChartEmpty message="No data available for this breakdown." />;
  const vertical = layout === "vertical";
  return (
    <ResponsiveContainer width="100%" height={vertical ? Math.max(240, data.length * 34) : 280}>
      <BarChart data={data} layout={layout} margin={{ top: 8, right: 16, left: vertical ? 24 : 0, bottom: 0 }}>
        <CartesianGrid stroke={COLORS.grid} horizontal={!vertical} vertical={vertical} />
        {vertical ? (
          <>
            <XAxis type="number" tick={{ fontSize: 11 }} tickFormatter={(v) => fmtPct(v, 0)} />
            <YAxis type="category" dataKey="name" width={100} tick={{ fontSize: 11 }} />
          </>
        ) : (
          <>
            <XAxis dataKey="name" tick={{ fontSize: 11 }} />
            <YAxis tick={{ fontSize: 11 }} tickFormatter={(v) => fmtPct(v, 0)} />
          </>
        )}
        <Tooltip formatter={(v) => [fmtPct(Number(v), 2), "Flag rate"]} />
        <Bar dataKey="rate" fill={color} radius={3} />
      </BarChart>
    </ResponsiveContainer>
  );
}
