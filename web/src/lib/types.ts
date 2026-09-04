export type Service = {
  service_id: string;
  provider: string;
  service_name: string;
  service_url: string;
  terms: string;
  threshold_bps: number;
  window_days: number;
  compensation_type: "refund" | "credit";
  compensation_bps: number;
  subscription_price_wei: number;
  collateral_wei: number;
  reserved_wei: number;
  provider_revenue_wei: number;
  subscriber_count: number;
  status: "active" | "paused";
  created_at: number;
  last_uptime_bps: number;
};

export type Subscription = {
  subscription_id: string;
  service_id: string;
  customer: string;
  provider: string;
  subscription_price_wei: number;
  max_payout_wei: number;
  started_at: number;
  status: "active";
  claim_count: number;
  compensated_wei: number;
};

export type Snapshot = {
  snapshot_id: string;
  service_id: string;
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
  service_id: string;
  subscription_id: string;
  customer: string;
  provider: string;
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
