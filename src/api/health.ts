/**
 * Health-rollup API — the cockpit's "is everything OK right now?" backend.
 *
 * Wraps deployment-api's Phase-1 observability endpoints:
 *   GET /api/health/overview      — one envelope of color-coded health tiles
 *   GET /api/health/consolidator  — per-asset_group manifest-consolidator drill-down
 *
 * Same raw-fetch + handleResponse shape as src/api/deploymentApi.ts so the cockpit
 * reads one consistent client. Real cloud data in LIVE mode; src/lib/mock-api.ts
 * serves a deterministic shape in MOCK mode (playwright/vitest).
 */

const DEPLOYMENT_API = import.meta.env.VITE_DEPLOYMENT_API_URL ?? "";

async function handleResponse<T>(response: Response): Promise<T> {
  if (!response.ok) {
    throw new Error(`HTTP ${response.status} ${response.statusText}`);
  }
  return response.json() as Promise<T>;
}

/** Health rollup status — mirrors the backend `overall` / per-tile `status`. */
export type HealthStatus = "ok" | "degraded" | "critical";

/** One color-coded tile in the health overview rollup. */
export interface HealthOverviewTile {
  id: string;
  label: string;
  status: HealthStatus;
  value: string;
  detail_href: string;
}

/** GET /api/health/overview response envelope. */
export interface HealthOverviewResponse {
  generated_at: string;
  overall: HealthStatus;
  tiles: HealthOverviewTile[];
}

export async function getHealthOverview(): Promise<HealthOverviewResponse> {
  const response = await fetch(`${DEPLOYMENT_API}/api/health/overview`);
  return handleResponse<HealthOverviewResponse>(response);
}

/** Per-asset_group manifest-consolidator health (drill-down from the overview tile). */
export interface ConsolidatorAssetGroup {
  asset_group: string;
  bucket: string;
  status: HealthStatus;
  index_age_seconds: number | null;
  staleness_budget_seconds: number;
  per_vm_shard_fallback_active: boolean;
  last_successful_run_at: string | null;
  detail: string;
}

/** GET /api/health/consolidator response envelope. */
export interface HealthConsolidatorResponse {
  generated_at: string;
  overall: HealthStatus;
  asset_groups: ConsolidatorAssetGroup[];
}

export async function getHealthConsolidator(): Promise<HealthConsolidatorResponse> {
  const response = await fetch(`${DEPLOYMENT_API}/api/health/consolidator`);
  return handleResponse<HealthConsolidatorResponse>(response);
}

/** One reconciled instance (UNKNOWN running-but-unregistered, or EXPECTED-MISSING). */
export interface ReconciliationRow {
  name: string;
  umbrella: string;
  cloud: string;
  service: string;
  asset_group: string;
}

/** Per-cloud reconciliation — running/registered counts + the two alarm row-sets (capped). */
export interface CloudReconciliation {
  cloud: string;
  running: number;
  registered: number;
  unknown_count: number;
  expected_missing_count: number;
  unknown: ReconciliationRow[];
  expected_missing: ReconciliationRow[];
}

/** GET /api/fleet/reconciliation — cross-cloud "every running instance accounted for". */
export interface FleetReconciliationResponse {
  generated_at: string;
  overall: HealthStatus;
  clouds: CloudReconciliation[];
  unknown_total: number;
  expected_missing_total: number;
}

export async function getFleetReconciliation(): Promise<FleetReconciliationResponse> {
  const response = await fetch(`${DEPLOYMENT_API}/api/fleet/reconciliation`);
  return handleResponse<FleetReconciliationResponse>(response);
}

/**
 * Per-deployment, MANIFEST-DERIVED data freshness (NOT the in-memory health-ping
 * callback). The deployment's `ShardResponsibility` resolves which asset_group's
 * availability-index heartbeat counts as its freshness; a `none` responsibility
 * (gateway / control-plane) honestly reports `liveness_only` — never a false "fresh".
 *
 * Backend: deployment-api@f05a1dc — GET /api/deployments/{id}/freshness.
 */
export type FreshnessStatus = "fresh" | "stale" | "liveness_only" | "unknown";

export interface DeploymentFreshnessResponse {
  deployment_id: string;
  responsibility: string;
  asset_group: string | null;
  mode: string | null;
  freshness_status: FreshnessStatus;
  index_age_seconds: number | null;
  staleness_budget_seconds: number | null;
  per_vm_shard_fallback_active: boolean;
  oldest_available_at: string | null;
  detail: string;
}

export async function getDeploymentFreshness(id: string): Promise<DeploymentFreshnessResponse> {
  const response = await fetch(`${DEPLOYMENT_API}/api/deployments/${encodeURIComponent(id)}/freshness`);
  return handleResponse<DeploymentFreshnessResponse>(response);
}
