import type { Analysis, PredictResponse, RawRecord, RiskLevel, Row } from "./types";

const FRAUD_KEYS = ["prediction", "result", "fraud_probability", "confidence", "threshold"];

const num = (v: unknown): number => {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
};

function riskLevel(fraudFlag: boolean, amlFlag: boolean, fraudProb: number, amlProb: number, ft: number, at: number): RiskLevel {
  if (fraudFlag && amlFlag) return "Critical";
  if (fraudFlag || amlFlag) return "High";
  if (fraudProb >= ft * 0.5 || amlProb >= at * 0.5) return "Medium";
  return "Low";
}

// Both models score the same uploaded rows in the same order, so rows are joined by index.
export function buildAnalysis(res: PredictResponse): Analysis {
  const ft = res.metrics.threshold;
  const at = res.aml.metrics.threshold;

  const rows: Row[] = res.transactions.map((fraudRec, i) => {
    const amlRec = res.aml.transactions[i] ?? {};
    const raw: RawRecord = {};
    for (const [k, v] of Object.entries(fraudRec)) if (!FRAUD_KEYS.includes(k)) raw[k] = v;

    const fraudProb = num(fraudRec.fraud_probability);
    const amlProb = num(amlRec.aml_probability);
    const fraudFlag = num(fraudRec.prediction) === 1;
    const amlFlag = num(amlRec.aml_prediction) === 1;

    return {
      id: i + 1,
      raw,
      fraudProb,
      fraudFlag,
      fraudConfidence: num(fraudRec.confidence),
      amlProb,
      amlFlag,
      amlConfidence: num(amlRec.aml_confidence),
      risk: riskLevel(fraudFlag, amlFlag, fraudProb, amlProb, ft, at),
      amount: num(fraudRec.amount),
      type: String(fraudRec.type ?? "Unknown"),
    };
  });

  return { filename: res.filename, fraudMetrics: res.metrics, amlMetrics: res.aml.metrics, rows };
}

// ---------- formatting ----------

export const fmtInt = (n: number) => n.toLocaleString("en-US");
export const fmtPct = (n: number, digits = 1) => `${(n * 100).toFixed(digits)}%`;
export const fmtMoney = (n: number) =>
  n >= 1e9 ? `$${(n / 1e9).toFixed(2)}B` : n >= 1e6 ? `$${(n / 1e6).toFixed(2)}M` : n >= 1e3 ? `$${(n / 1e3).toFixed(1)}K` : `$${n.toFixed(2)}`;

export function formatCell(key: string, value: unknown): string {
  if (value === null || value === undefined) return "-";
  // pandas serialises Excel dates as epoch milliseconds.
  if (/date/i.test(key) && typeof value === "number" && value > 1e10) return new Date(value).toISOString().slice(0, 10);
  if (typeof value === "number") return Number.isInteger(value) ? value.toLocaleString("en-US") : value.toLocaleString("en-US", { maximumFractionDigits: 4 });
  return String(value);
}

export function hourOf(raw: RawRecord): number | null {
  const t = raw["Time"];
  if (typeof t === "string") {
    const m = t.match(/(\d{1,2}):\d{2}/);
    if (m) return Number(m[1]) % 24;
  }
  if (typeof t === "number" && t > 1e10) return new Date(t).getUTCHours();
  return null;
}

// ---------- aggregations ----------

export interface Bin {
  label: string;
  start: number;
  count: number;
  flagged: boolean;
}

export function histogram(values: number[], threshold: number, bins = 20): Bin[] {
  const out: Bin[] = Array.from({ length: bins }, (_, i) => ({
    label: `${Math.round((i / bins) * 100)}-${Math.round(((i + 1) / bins) * 100)}%`,
    start: i / bins,
    count: 0,
    flagged: (i + 1) / bins > threshold,
  }));
  for (const v of values) out[Math.min(bins - 1, Math.max(0, Math.floor(v * bins)))].count++;
  return out;
}

export interface GroupStat {
  name: string;
  flagged: number;
  normal: number;
  total: number;
  rate: number;
}

export function groupStats(rows: Row[], keyFn: (r: Row) => string, flagFn: (r: Row) => boolean, limit = 10): GroupStat[] {
  const map = new Map<string, GroupStat>();
  for (const r of rows) {
    const name = keyFn(r) || "Unknown";
    const g = map.get(name) ?? { name, flagged: 0, normal: 0, total: 0, rate: 0 };
    if (flagFn(r)) g.flagged++;
    else g.normal++;
    g.total++;
    map.set(name, g);
  }
  return [...map.values()]
    .map((g) => ({ ...g, rate: g.flagged / g.total }))
    .sort((a, b) => b.total - a.total)
    .slice(0, limit);
}

export function hourlyStats(rows: Row[]): GroupStat[] {
  const out: GroupStat[] = Array.from({ length: 24 }, (_, h) => ({ name: `${String(h).padStart(2, "0")}h`, flagged: 0, normal: 0, total: 0, rate: 0 }));
  let seen = 0;
  for (const r of rows) {
    const h = hourOf(r.raw);
    if (h === null) continue;
    seen++;
    if (r.amlFlag) out[h].flagged++;
    else out[h].normal++;
    out[h].total++;
  }
  out.forEach((g) => (g.rate = g.total ? g.flagged / g.total : 0));
  return seen ? out : [];
}

// Keeps flagged points and evenly samples the rest so scatter plots stay responsive.
export function samplePoints(rows: Row[], max = 2500): Row[] {
  if (rows.length <= max) return rows;
  const flagged = rows.filter((r) => r.fraudFlag || r.amlFlag).slice(0, max / 2);
  const rest = rows.filter((r) => !r.fraudFlag && !r.amlFlag);
  const step = Math.max(1, Math.floor(rest.length / (max - flagged.length)));
  return [...flagged, ...rest.filter((_, i) => i % step === 0)];
}

export function mean(values: number[]): number {
  return values.length ? values.reduce((a, b) => a + b, 0) / values.length : 0;
}

export function exportCsv(a: Analysis) {
  const rawKeys = [...new Set(a.rows.flatMap((r) => Object.keys(r.raw)))];
  const header = [...rawKeys, "fraud_probability", "fraud_result", "aml_probability", "aml_result", "risk_level"];
  const esc = (v: unknown) => {
    const s = v === null || v === undefined ? "" : String(v);
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const lines = a.rows.map((r) =>
    [
      ...rawKeys.map((k) => r.raw[k]),
      r.fraudProb,
      r.fraudFlag ? "Fraud" : "Legitimate",
      r.amlProb,
      r.amlFlag ? "Suspicious" : "Normal",
      r.risk,
    ]
      .map(esc)
      .join(","),
  );
  const blob = new Blob([[header.join(","), ...lines].join("\n")], { type: "text/csv" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `${a.filename.replace(/\.xlsx$/i, "")}_predictions.csv`;
  link.click();
  URL.revokeObjectURL(url);
}
