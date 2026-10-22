import { useCallback, useEffect, useRef, useState } from "react";
import { fetchHealth, MAX_UPLOAD_BYTES } from "../api";
import type { HealthResponse } from "../types";

interface Props {
  loading: boolean;
  error: string | null;
  onFile: (file: File) => void;
  compact?: boolean;
}

export function HealthDot() {
  const [health, setHealth] = useState<HealthResponse | "down" | null>(null);

  useEffect(() => {
    fetchHealth().then(setHealth).catch(() => setHealth("down"));
  }, []);

  const ready = health !== null && health !== "down" && health.status === "healthy";
  const label = health === null ? "Checking API..." : health === "down" ? "API offline" : ready ? "Models ready" : "Models loading";
  const cls = health === null ? "dot-wait" : ready ? "dot-ok" : "dot-bad";

  return (
    <span className="health" title={health && health !== "down" ? JSON.stringify(health) : undefined}>
      <i className={`dot ${cls}`} /> {label}
    </span>
  );
}

export function UploadPanel({ loading, error, onFile, compact }: Props) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);
  const [localError, setLocalError] = useState<string | null>(null);

  const accept = useCallback(
    (file: File | undefined) => {
      if (!file) return;
      if (!file.name.toLowerCase().endsWith(".xlsx")) return setLocalError("Only .xlsx Excel files are supported.");
      if (file.size > MAX_UPLOAD_BYTES) return setLocalError("File exceeds the 50 MB limit.");
      setLocalError(null);
      onFile(file);
    },
    [onFile],
  );

  const shownError = localError ?? error;

  return (
    <div className={compact ? "upload upload-compact" : "upload"}>
      <div
        className={`dropzone ${dragging ? "dropzone-active" : ""} ${loading ? "dropzone-busy" : ""}`}
        onClick={() => !loading && inputRef.current?.click()}
        onDragOver={(e) => {
          e.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragging(false);
          if (!loading) accept(e.dataTransfer.files[0]);
        }}
        role="button"
        tabIndex={0}
        onKeyDown={(e) => e.key === "Enter" && !loading && inputRef.current?.click()}
      >
        <input ref={inputRef} type="file" accept=".xlsx" hidden onChange={(e) => { accept(e.target.files?.[0]); e.target.value = ""; }} />
        {loading ? (
          <>
            <div className="spinner" />
            <p className="dz-title">Scoring transactions...</p>
            <p className="dz-sub">Running the fraud and AML models. Large files can take a while.</p>
          </>
        ) : (
          <>
            <div className="dz-icon">&#8679;</div>
            <p className="dz-title">{compact ? "Upload another file" : "Drop an Excel file here, or click to browse"}</p>
            <p className="dz-sub">.xlsx, up to 50 MB</p>
          </>
        )}
      </div>
      {shownError && <div className="alert">{shownError}</div>}
      {!compact && (
        <div className="columns-help">
          <div>
            <h4>Fraud model columns</h4>
            <code>step, type, amount, oldbalanceOrg, newbalanceOrig, oldbalanceDest, newbalanceDest</code>
          </div>
          <div>
            <h4>AML model columns</h4>
            <code>Date, Time, Amount, Sender_account, Receiver_account, Payment_currency, Received_currency, Sender_bank_location, Receiver_bank_location, Payment_type</code>
          </div>
        </div>
      )}
    </div>
  );
}
