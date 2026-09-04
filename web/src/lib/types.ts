export type Agreement = {
  agreement_id: string;
  customer: string;
  service_name: string;
  service_url: string;
  terms: string;
  threshold_bps: number;
  window_days: number;
  compensation_type: "refund" | "credit";
  compensation_bps: number;
  deposit_wei: number;
  status: string;
  created_at: number;
  claim_count: number;
  last_uptime_bps: number;
};

export type Snapshot = {
  snapshot_id: string;
  agreement_id: string;
  period_start: string;
  period_end: string;
  uptime_bps: number;
  total_checks: number;
  failed_checks: number;
  evidence_url: string;
  signature: string;
  publisher: string;
  published_at: number;
};

export type Claim = {
  claim_id: string;
  agreement_id: string;
  customer: string;
  snapshot_id: string;
  status: "breached" | "clear" | "unavailable";
  uptime_bps: number;
  threshold_bps: number;
  settlement_type: "refund" | "credit";
  settlement_wei: number;
  evidence_url: string;
  evidence_signature: string;
  resolved_at: number;
};
