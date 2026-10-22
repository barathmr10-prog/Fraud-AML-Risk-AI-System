export interface FraudMetrics {
  total_transactions: number;
  fraud_count: number;
  legitimate_count: number;
  fraud_percentage: number;
  threshold: number;
}

export interface AmlMetrics {
  total_transactions: number;
  aml_count: number;
  normal_count: number;
  aml_percentage: number;
  threshold: number;
}

export type RawRecord = Record<string, unknown>;

export interface PredictResponse {
  filename: string;
  metrics: FraudMetrics;
  transactions: RawRecord[];
  aml: {
    metrics: AmlMetrics;
    transactions: RawRecord[];
  };
}

export interface HealthResponse {
  status: "healthy" | "not_ready";
  model_loaded: boolean;
  encoder_loaded: boolean;
  aml_loaded: boolean;
}

export type RiskLevel = "Critical" | "High" | "Medium" | "Low";

export interface Row {
  id: number;
  raw: RawRecord;
  fraudProb: number;
  fraudFlag: boolean;
  fraudConfidence: number;
  amlProb: number;
  amlFlag: boolean;
  amlConfidence: number;
  risk: RiskLevel;
  // Fraud-model amount (lowercase "amount" column).
  amount: number;
  type: string;
}

export interface Analysis {
  filename: string;
  fraudMetrics: FraudMetrics;
  amlMetrics: AmlMetrics;
  rows: Row[];
}
