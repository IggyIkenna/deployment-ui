/**
 * API client for deployment-api treasury endpoints.
 *
 * Base URL: VITE_DEPLOYMENT_API_URL (default: http://localhost:8004).
 * Endpoints:
 *   GET /api/clients/{client_id}/treasury   (Phase 6.A)
 *   GET /api/clients/{client_id}/subscriptions  (Phase 6.B)
 *   POST /api/clients/{client_id}/withdrawal-request  (Phase 6.C UI stub)
 *
 * Plan: wallet_treasury_client_flow_2026_05_10.md Phase 6.
 */

const DEPLOYMENT_API_BASE =
  import.meta.env.VITE_DEPLOYMENT_API_URL ?? "http://localhost:8004";

async function apiFetch<T>(path: string, options?: RequestInit): Promise<T> {
  const res = await fetch(`${DEPLOYMENT_API_BASE}${path}`, {
    headers: { Accept: "application/json" },
    ...options,
  });
  if (!res.ok) {
    const text = await res.text().catch(() => res.statusText);
    throw new Error(`deployment-api ${path}: ${res.status} ${text}`);
  }
  return res.json() as Promise<T>;
}

// ---------------------------------------------------------------------------
// Types — mirror deployment_api/routes/treasury.py response shapes
// ---------------------------------------------------------------------------

export interface TreasurySourceAttribution {
  source: string;
  client_share_pct: string;
  client_share_usd: string;
  source_nav_usd: string;
}

export interface CustodyPingResult {
  source: string;
  is_reachable: boolean;
  balance_usd: string | null;
  as_of_timestamp: string | null;
  latency_ms: number;
  error_message: string;
}

export interface ShareClassSubscription {
  client_id: string;
  share_class_id: string;
  archetype_id: string;
  allocation_pct: string;
  max_drawdown_for_suspension_pct: string;
  subscribed_at: string;
  suspended_at: string | null;
  suspension_reason: string;
  is_active: boolean;
}

export interface AllocationDecision {
  archetype_id: string;
  share_class_id: string;
  allocation_amount_usd: string;
  decision_event_id: string;
  decided_at: string;
}

export interface TradeSettledSummary {
  trade_id: string;
  archetype_id: string;
  venue: string;
  side: "buy" | "sell";
  quantity: string;
  fill_price: string;
  pnl_usd: string;
  settled_at: string;
}

export interface ClientTreasury {
  client_id: string;
  as_of: string;
  subscriptions: ShareClassSubscription[];
  treasury_attribution: TreasurySourceAttribution[];
  custody_ping_results: CustodyPingResult[];
  allocations: AllocationDecision[];
  last_settled: TradeSettledSummary | null;
  nav_usd: string;
}

export interface ClientSubscriptions {
  client_id: string;
  subscriptions: ShareClassSubscription[];
  onboarding_state: string;
}

// ---------------------------------------------------------------------------
// API functions
// ---------------------------------------------------------------------------

/**
 * Fetch per-client treasury attribution view (Phase 6.A).
 *
 * Pass rollupNavUsd to override the canonical rollup NAV — used by Playwright
 * smoke to verify the NAV reconciliation invariant.
 */
export async function fetchClientTreasury(
  clientId: string,
  rollupNavUsd?: string,
): Promise<ClientTreasury> {
  const qs = rollupNavUsd
    ? `?rollup_nav_usd=${encodeURIComponent(rollupNavUsd)}`
    : "";
  return apiFetch<ClientTreasury>(`/api/clients/${clientId}/treasury${qs}`);
}

/**
 * Fetch per-client share-class subscription list (Phase 6.B).
 */
export async function fetchClientSubscriptions(
  clientId: string,
): Promise<ClientSubscriptions> {
  return apiFetch<ClientSubscriptions>(
    `/api/clients/${clientId}/subscriptions`,
  );
}

/**
 * Stub for POST withdrawal request (Phase 6.C UI trigger).
 * Full executor is in UTL Phase 5.B; this stub records the operator's intent.
 */
export async function postWithdrawalRequest(
  clientId: string,
  payload: {
    treasury_source: string;
    amount_usd: string;
    destination_address: string;
    operator_note?: string;
  },
): Promise<{ request_id: string; status: string }> {
  return apiFetch<{ request_id: string; status: string }>(
    `/api/clients/${clientId}/withdrawal-request`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    },
  );
}
