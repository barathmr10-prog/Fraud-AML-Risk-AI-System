import { useEffect } from "react";
import type { Row } from "../types";
import { formatCell, fmtPct } from "../analytics";
import { COLORS, FlagBadge, ProbBar, RiskBadge } from "./ui";

interface Props {
  row: Row | null;
  threshold: { fraud: number; aml: number };
  onClose: () => void;
}

function ScoreBlock({ title, prob, confidence, threshold, flagged, yes, no, color }: { title: string; prob: number; confidence: number; threshold: number; flagged: boolean; yes: string; no: string; color: string }) {
  return (
    <div className="score">
      <div className="score-head">
        <h4>{title}</h4>
        <FlagBadge flagged={flagged} yes={yes} no={no} />
      </div>
      <div className="score-value" style={{ color: flagged ? color : COLORS.ok }}>{fmtPct(prob, 2)}</div>
      <ProbBar value={prob} threshold={threshold} color={color} />
      <div className="score-meta">
        <span>Threshold {fmtPct(threshold, 0)}</span>
        <span>Confidence {fmtPct(confidence, 1)}</span>
      </div>
    </div>
  );
}

export function DetailDrawer({ row, threshold, onClose }: Props) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  if (!row) return null;

  return (
    <>
      <div className="backdrop" onClick={onClose} />
      <aside className="drawer" role="dialog" aria-label="Transaction details">
        <header className="drawer-head">
          <div>
            <h2>Transaction #{row.id}</h2>
            <RiskBadge level={row.risk} />
          </div>
          <button className="icon-btn" onClick={onClose} aria-label="Close">&times;</button>
        </header>

        <div className="scores">
          <ScoreBlock title="Fraud model" prob={row.fraudProb} confidence={row.fraudConfidence} threshold={threshold.fraud} flagged={row.fraudFlag} yes="Fraud" no="Legitimate" color={COLORS.fraud} />
          <ScoreBlock title="AML model" prob={row.amlProb} confidence={row.amlConfidence} threshold={threshold.aml} flagged={row.amlFlag} yes="Suspicious" no="Normal" color={COLORS.aml} />
        </div>

        <h4 className="drawer-sub">Uploaded values</h4>
        <dl className="kv">
          {Object.entries(row.raw).map(([k, v]) => (
            <div key={k}>
              <dt>{k}</dt>
              <dd>{formatCell(k, v)}</dd>
            </div>
          ))}
        </dl>
      </aside>
    </>
  );
}
