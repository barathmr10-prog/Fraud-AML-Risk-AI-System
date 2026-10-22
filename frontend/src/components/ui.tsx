import type { ReactNode } from "react";
import type { RiskLevel } from "../types";
import { fmtPct } from "../analytics";

export const COLORS = {
  fraud: "#ef4444",
  aml: "#f59e0b",
  ok: "#22c55e",
  info: "#3b82f6",
  muted: "#94a3b8",
  grid: "#e2e8f0",
};

export const RISK_COLORS: Record<RiskLevel, string> = {
  Critical: "#b91c1c",
  High: "#ef4444",
  Medium: "#f59e0b",
  Low: "#22c55e",
};

export function Card({ title, subtitle, children, className = "" }: { title?: string; subtitle?: string; children: ReactNode; className?: string }) {
  return (
    <section className={`card ${className}`}>
      {title && (
        <header className="card-head">
          <h3>{title}</h3>
          {subtitle && <p>{subtitle}</p>}
        </header>
      )}
      {children}
    </section>
  );
}

export function Kpi({ label, value, hint, color }: { label: string; value: string; hint?: string; color?: string }) {
  return (
    <div className="kpi" style={color ? { borderTopColor: color } : undefined}>
      <span className="kpi-label">{label}</span>
      <strong className="kpi-value" style={color ? { color } : undefined}>{value}</strong>
      {hint && <span className="kpi-hint">{hint}</span>}
    </div>
  );
}

export function RiskBadge({ level }: { level: RiskLevel }) {
  return <span className="badge" style={{ background: RISK_COLORS[level] }}>{level}</span>;
}

export function FlagBadge({ flagged, yes, no }: { flagged: boolean; yes: string; no: string }) {
  return <span className={`pill ${flagged ? "pill-bad" : "pill-ok"}`}>{flagged ? yes : no}</span>;
}

// Horizontal probability bar with a marker at the model's decision threshold.
export function ProbBar({ value, threshold, color }: { value: number; threshold: number; color: string }) {
  return (
    <div className="probbar" title={`${fmtPct(value, 2)} (threshold ${fmtPct(threshold, 0)})`}>
      <div className="probbar-fill" style={{ width: `${Math.max(value * 100, 0.5)}%`, background: color }} />
      <div className="probbar-mark" style={{ left: `${threshold * 100}%` }} />
    </div>
  );
}

export function ChartEmpty({ message }: { message: string }) {
  return <div className="chart-empty">{message}</div>;
}
