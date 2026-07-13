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
  /** Per-VM shards written since the last merge (not yet absorbed) — the backlog. */
  pending_shard_count?: number | null;
  /** Per-VM shards present (fan-in width). */
  total_shard_count?: number | null;
  detail: string;
}

/** Data-correctness lens: did this consolidator run PRODUCE its data (derived from freshness + backlog). */
export type ConsolidatorVerdict = "produced" | "producing" | "stale_output" | "fired_but_empty" | "empty" | "unknown";

/** Per-CONSOLIDATOR posture — one per (kind, asset_group) in the terraform estate (~25 jobs). */
export interface ConsolidatorHealth {
  /** Terraform key + Cloud Run job suffix, e.g. "market-data-cefi". */
  category: string;
  /** Grouping axis: market-data / instruments / features-* / execution / strategy / ml / gas-fees. */
  kind: string;
  /** null for flat consolidators (strategy / gas-fees / ml-…). */
  asset_group: string | null;
  /** Cloud Run job short-name — the join key the deployments detail popover cross-links on. */
  job_name: string;
  bucket: string;
  status: HealthStatus;
  verdict: ConsolidatorVerdict;
  index_age_seconds: number | null;
  staleness_budget_seconds: number;
  last_successful_run_at: string | null;
  /** Backlog: per-VM shards written since the last merge (not yet absorbed). */
  pending_shard_count?: number | null;
  /** Fan-in width: per-VM shards currently feeding this index (active writers). */
  total_shard_count?: number | null;
  /** Age (seconds) of the OLDEST un-absorbed per-VM shard — how long the merge has been behind. */
  oldest_pending_shard_age_seconds?: number | null;
  /** Absolute rows in the consolidated availability_index.parquet (its parquet num_rows). */
  index_row_count?: number | null;
  /** Absolute size of the consolidated index file in bytes (a large index is what OOMs a consolidator). */
  index_size_bytes?: number | null;
  /** Latest Cloud Run execution posture for THIS job — the fired-but-empty discriminator. */
  execution_status?: string | null;
  /** ISO-8601 completion time of the latest execution. */
  execution_last_run_at?: string | null;
  /** 0 succeeded / 1 failed (synthesised from Cloud Run counts). */
  execution_exit_code?: number | null;
  /** Does this consolidator publish a latest.json run summary — i.e. is it live/reporting? A
   *  dead / never-fired consolidator is false (no latest.json), shown honestly as "not reporting". */
  run_reporting?: boolean;
  /** Self-reported production verdict from the last run: produced | empty | failed. */
  run_verdict?: string | null;
  /** ISO-8601 of the last self-reported run. */
  run_last_run_at?: string | null;
  /** Shards merged in the last run. */
  run_shards_changed?: number | null;
  /** Rows added to the index in the last run. */
  run_rows_added?: number | null;
  /** The last run's duration in milliseconds. */
  run_duration_ms?: number | null;
  /** Dark data-correctness actors — the last phantom audit + empty re-probe for this AG, self-published
   *  by the reconcile/re-probe scripts. Absent (null) = "no audit yet" (shown loudly; phantom is ~weekly).
   *  Only market-data / instruments buckets carry these. */
  /** ISO-8601 of the last phantom audit. */
  phantom_audit_at?: string | null;
  /** Phantoms found in the last audit (0 = clean). */
  phantom_count?: number | null;
  /** gs:// drill-down triage JSONL, when phantoms > 0. */
  phantom_triage_link?: string | null;
  /** ISO-8601 of the last empty re-probe. */
  reprobe_audit_at?: string | null;
  /** New empty_confirmed cells re-probed in the last run. */
  reprobe_new_empties?: number | null;
  /** Oracle/re-fetch says data SHOULD exist (candidate C1 misclassification bugs). */
  reprobe_disagreements?: number | null;
  /** Proven-misclassified empties auto-flipped to attempted_failed. */
  reprobe_reclassified?: number | null;
  detail: string;
}

/** GET /api/health/consolidator response envelope. */
export interface HealthConsolidatorResponse {
  generated_at: string;
  overall: HealthStatus;
  /** Legacy per-AG view (the 5 market-data buckets) — kept for back-compat. */
  asset_groups: ConsolidatorAssetGroup[];
  /** The full per-consolidator estate (~25 jobs), catalog-driven. */
  consolidators?: ConsolidatorHealth[];
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
