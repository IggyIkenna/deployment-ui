/**
 * API client for client-reporting-api endpoints.
 *
 * Base URL: VITE_CLIENT_REPORTING_API_URL (default: http://localhost:8014).
 * Endpoints: /api/v1/clients/{client_id}/nav|pnl|positions|attribution|hwm-timeline
 *
 * Plan: client_reporting_pnl_attribution_mvp_2026_05_10.md Phase 5.
 */

const CLIENT_REPORTING_BASE =
  import.meta.env.VITE_CLIENT_REPORTING_API_URL ?? "http://localhost:8014";

async function crFetch<T>(path: string): Promise<T> {
  const res = await fetch(`${CLIENT_REPORTING_BASE}${path}`, {
    headers: { Accept: "application/json" },
  });
  if (!res.ok) {
    const text = await res.text().catch(() => res.statusText);
    throw new Error(`client-reporting-api ${path}: ${res.status} ${text}`);
  }
  return res.json() as Promise<T>;
}

export interface NavSnapshot {
  date: string;
  nav_usd: string;
  nav_in_share_class: string;
  nav_delta_usd: string;
  timestamp: string;
}

export interface NavResponse {
  client_id: string;
  share_class: string;
  mode: string;
  snapshots: NavSnapshot[];
}

export interface PnLEntry {
  period_tag: string;
  realized_pnl: string;
  unrealized_pnl: string;
  total_pnl: string;
  strategy_alpha_total: string;
  execution_alpha_total: string;
  timestamp: string;
}

export interface PnLResponse {
  client_id: string;
  share_class: string;
  entries: PnLEntry[];
}

export interface Position {
  archetype_id: string | null;
  strategy_leg_id: string | null;
  trade_id: string | null;
  venue: string;
  instrument: string;
  qty: string;
  mark_price: string;
  cost_basis: string;
  realized_pnl: string;
  unrealized_pnl: string;
  share_class: string;
  timestamp: string;
}

export interface PositionsResponse {
  client_id: string;
  positions: Position[];
}

export interface AttributionRow {
  strategy_id: string | null;
  instrument_id: string | null;
  date: string | null;
  factor: string | null;
  layer: string | null;
  amount: number | string | null;
  archetype_id: string | null;
  fill_id: string | null;
  venue: string | null;
  benchmark_price: number | string | null;
}

export interface AttributionResponse {
  client_id: string;
  rows: AttributionRow[];
}

export function fetchNav(
  clientId: string,
  dateFrom?: string,
  dateTo?: string,
): Promise<NavResponse> {
  const params = new URLSearchParams();
  if (dateFrom) params.set("date_from", dateFrom);
  if (dateTo) params.set("date_to", dateTo);
  const qs = params.toString() ? `?${params.toString()}` : "";
  return crFetch<NavResponse>(
    `/api/v1/clients/${encodeURIComponent(clientId)}/nav${qs}`,
  );
}

export function fetchPnL(
  clientId: string,
  dateFrom?: string,
  dateTo?: string,
): Promise<PnLResponse> {
  const params = new URLSearchParams();
  if (dateFrom) params.set("date_from", dateFrom);
  if (dateTo) params.set("date_to", dateTo);
  const qs = params.toString() ? `?${params.toString()}` : "";
  return crFetch<PnLResponse>(
    `/api/v1/clients/${encodeURIComponent(clientId)}/pnl${qs}`,
  );
}

export function fetchPositions(clientId: string): Promise<PositionsResponse> {
  return crFetch<PositionsResponse>(
    `/api/v1/clients/${encodeURIComponent(clientId)}/positions`,
  );
}

export function fetchAttribution(
  clientId: string,
  dateFrom?: string,
  dateTo?: string,
): Promise<AttributionResponse> {
  const params = new URLSearchParams();
  if (dateFrom) params.set("date_from", dateFrom);
  if (dateTo) params.set("date_to", dateTo);
  const qs = params.toString() ? `?${params.toString()}` : "";
  return crFetch<AttributionResponse>(
    `/api/v1/clients/${encodeURIComponent(clientId)}/attribution${qs}`,
  );
}

export interface HwmCrystallizationRow {
  share_class_id: string | null;
  period_start: string | null;
  period_end: string | null;
  recognition_type: string | null;
  amount_usd: string | null;
  recognized_at: string | null;
  source_event_id: string | null;
}

export interface HwmTimelineResponse {
  client_id: string;
  rows: HwmCrystallizationRow[];
}

export function fetchHwmTimeline(
  clientId: string,
  dateFrom?: string,
  dateTo?: string,
): Promise<HwmTimelineResponse> {
  const params = new URLSearchParams();
  if (dateFrom) params.set("date_from", dateFrom);
  if (dateTo) params.set("date_to", dateTo);
  const qs = params.toString() ? `?${params.toString()}` : "";
  return crFetch<HwmTimelineResponse>(
    `/api/v1/clients/${encodeURIComponent(clientId)}/hwm-timeline${qs}`,
  );
}
