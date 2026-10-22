import { useCallback, useState } from "react";
import { predictFile } from "./api";
import { buildAnalysis, exportCsv } from "./analytics";
import type { Analysis, Row } from "./types";
import { AmlView } from "./components/AmlView";
import { DetailDrawer } from "./components/DetailDrawer";
import { FraudView } from "./components/FraudView";
import { Overview } from "./components/Overview";
import { TransactionsTable } from "./components/TransactionsTable";
import { HealthDot, UploadPanel } from "./components/UploadPanel";

type Tab = "overview" | "fraud" | "aml" | "transactions";

const TABS: [Tab, string][] = [
  ["overview", "Overview"],
  ["fraud", "Fraud"],
  ["aml", "AML"],
  ["transactions", "Transactions"],
];

export default function App() {
  const [analysis, setAnalysis] = useState<Analysis | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [tab, setTab] = useState<Tab>("overview");
  const [selected, setSelected] = useState<Row | null>(null);

  const onFile = useCallback(async (file: File) => {
    setLoading(true);
    setError(null);
    try {
      setAnalysis(buildAnalysis(await predictFile(file)));
      setTab("overview");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Upload failed.");
    } finally {
      setLoading(false);
    }
  }, []);

  const threshold = analysis ? { fraud: analysis.fraudMetrics.threshold, aml: analysis.amlMetrics.threshold } : { fraud: 0.9, aml: 0.5 };
  const close = useCallback(() => setSelected(null), []);

  return (
    <div className="app">
      <header className="topbar">
        <div className="brand">
          <span className="logo">&#9919;</span>
          <div>
            <h1>Fraud &amp; AML Risk Console</h1>
            <p>Upload transactions, score them with both models, and review the results.</p>
          </div>
        </div>
        <HealthDot />
      </header>

      {!analysis ? (
        <main className="container narrow">
          <UploadPanel loading={loading} error={error} onFile={onFile} />
        </main>
      ) : (
        <main className="container">
          <div className="bar">
            <nav className="tabs">
              {TABS.map(([k, label]) => (
                <button key={k} className={tab === k ? "tab-on" : ""} onClick={() => setTab(k)}>{label}</button>
              ))}
            </nav>
            <div className="bar-actions">
              <button className="btn" onClick={() => exportCsv(analysis)}>Export CSV</button>
              <button className="btn btn-ghost" onClick={() => setAnalysis(null)}>New analysis</button>
            </div>
          </div>

          <UploadPanel compact loading={loading} error={error} onFile={onFile} />

          {tab === "overview" && <Overview analysis={analysis} onSelect={setSelected} />}
          {tab === "fraud" && <FraudView analysis={analysis} onSelect={setSelected} />}
          {tab === "aml" && <AmlView analysis={analysis} onSelect={setSelected} />}
          {tab === "transactions" && <TransactionsTable rows={analysis.rows} threshold={threshold} onSelect={setSelected} />}
        </main>
      )}

      <DetailDrawer row={selected} threshold={threshold} onClose={close} />
    </div>
  );
}
