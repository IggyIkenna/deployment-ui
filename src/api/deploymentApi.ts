import type { DeployJob, DeployParams, ServiceStatus } from "../types/deploymentTypes";
import type { OrphanVerdict } from "./client";

export interface BuildEntry {
  tag: string;
  display: string;
  version: string;
  branch: string;
  is_v1: boolean;
}

export type BuildEnvironment = "dev" | "staging" | "prod";

const DEPLOYMENT_API = import.meta.env.VITE_DEPLOYMENT_API_URL ?? "";

async function handleResponse<T>(response: Response): Promise<T> {
  if (!response.ok) {
    const text = await response.text().catch(() => "Unknown error");
    throw new Error(`HTTP ${response.status}: ${text}`);
  }
  return response.json() as Promise<T>;
}

export async function fetchServices(): Promise<ServiceStatus[]> {
  const response = await fetch(`${DEPLOYMENT_API}/api/services`);
  return handleResponse<ServiceStatus[]>(response);
}

export async function triggerDeploy(params: DeployParams): Promise<DeployJob> {
  const response = await fetch(`${DEPLOYMENT_API}/api/deployments`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(params),
  });
  return handleResponse<DeployJob>(response);
}

export async function fetchDeploymentHistory(serviceId?: string): Promise<DeployJob[]> {
  const query = serviceId ? `?service_id=${serviceId}` : "";
  const response = await fetch(`${DEPLOYMENT_API}/api/deployments${query}`);
  return handleResponse<DeployJob[]>(response);
}

export async function rollbackDeployment(jobId: string): Promise<DeployJob> {
  const response = await fetch(`${DEPLOYMENT_API}/api/deployments/${jobId}/rollback`, {
    method: "POST",
  });
  return handleResponse<DeployJob>(response);
}

export async function fetchBuilds(service: string, env: BuildEnvironment): Promise<BuildEntry[]> {
  const response = await fetch(`${DEPLOYMENT_API}/api/builds/${encodeURIComponent(service)}?env=${env}`);
  return handleResponse<BuildEntry[]>(response);
}

// -------------------------------------------------------------------------
// VM deployments (Gate G1 observability) — active + recent-archive view of
// batch VMs spawned via vm-exec-with-gcs-tee.sh.
// -------------------------------------------------------------------------

export interface VmDeploymentEntry {
  deployment_id: string;
  vm_name: string;
  asset_group: string;
  task: string;
  mode: string;
  start_date: string;
  end_date: string;
  status: "running" | "completed" | "failed" | string;
  started_at: string;
  last_heartbeat_at: string;
  completed_at: string | null;
  exit_code: number | null;
  rows_in: number;
  rows_out: number;
  rows_error: number;
  events_emitted: number;
  log_uri: string;
  archive_run_log_uri?: string;
  archive_serial_uri?: string;
  machine_type?: string | null;
  zone?: string | null;
  uptime_hours?: number | null;
  health_status?: string | null;
}

export interface VmDeploymentsListResponse {
  active: VmDeploymentEntry[];
  recent: VmDeploymentEntry[];
  archive_days: number;
}

export async function fetchVmDeployments(days = 7): Promise<VmDeploymentsListResponse> {
  const response = await fetch(`${DEPLOYMENT_API}/api/vm-deployments?days=${days}`);
  return handleResponse<VmDeploymentsListResponse>(response);
}

export async function fetchVmDeployment(deploymentId: string): Promise<VmDeploymentEntry> {
  const response = await fetch(`${DEPLOYMENT_API}/api/vm-deployments/${encodeURIComponent(deploymentId)}`);
  return handleResponse<VmDeploymentEntry>(response);
}

export interface VmReconcileResult {
  reaped_count: number;
  reaped: string[];
  running_vm_count: number;
  total_active_before: number;
}

export async function reconcileVmDeployments(): Promise<VmReconcileResult> {
  const response = await fetch(`${DEPLOYMENT_API}/api/vm-deployments/reconcile`, {
    method: "POST",
  });
  return handleResponse<VmReconcileResult>(response);
}

export interface DeploymentEventsResponse {
  deployment_id: string;
  events: Array<{
    event_type: string;
    timestamp: string;
    message?: string;
    [key: string]: unknown;
  }>;
  count: number;
}

export async function fetchVmDeploymentEvents(deploymentId: string): Promise<DeploymentEventsResponse> {
  const response = await fetch(`${DEPLOYMENT_API}/api/deployments/${encodeURIComponent(deploymentId)}/events`);
  return handleResponse<DeploymentEventsResponse>(response);
}

export async function deployBuild(
  service: string,
  imageTag: string,
  environment: BuildEnvironment,
): Promise<{
  status: string;
  service: string;
  image_tag: string;
  environment: string;
}> {
  const response = await fetch(`${DEPLOYMENT_API}/api/deployments/${encodeURIComponent(service)}/deploy`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ image_tag: imageTag, environment }),
  });
  return handleResponse<{
    status: string;
    service: string;
    image_tag: string;
    environment: string;
  }>(response);
}

// -------------------------------------------------------------------------
// Data Status Live (Monitor→Live sub-tab, DataStatusTab mode toggle)
// -------------------------------------------------------------------------

export interface LiveStatusRow {
  asset_group: string;
  data_type: string;
  venue: string;
  chain?: string;
  capture_status: "captured" | "empty_confirmed" | "attempted_failed" | "expected_unattempted";
  staleness_seconds: number;
  refreshed_at: string;
}

export interface LiveStatusResponse {
  rows: LiveStatusRow[];
  refreshed_at: string;
}

export async function getLiveStatus(): Promise<LiveStatusResponse> {
  const response = await fetch(`${DEPLOYMENT_API}/api/data-status/live`);
  return handleResponse<LiveStatusResponse>(response);
}

// -------------------------------------------------------------------------
// VM Events (StreamingLogsPanel for VM-based event streaming)
// -------------------------------------------------------------------------

export interface VmEvent {
  event_id: string;
  event_type: string;
  timestamp: string;
  vm_name: string;
  message?: string;
  [key: string]: unknown;
}

export interface VmEventsResponse {
  vm_name: string;
  events: VmEvent[];
  count: number;
}

export async function getVmEvents(vmName: string, date?: string): Promise<VmEventsResponse> {
  const params = new URLSearchParams();
  params.append("vm_name", vmName);
  if (date) params.append("date", date);
  const response = await fetch(`${DEPLOYMENT_API}/api/vm/events?${params.toString()}`);
  return handleResponse<VmEventsResponse>(response);
}

// -------------------------------------------------------------------------
// Research launch endpoints (POST /api/ml/experiment, /strategy/backtest,
// /execution/backtest)
// -------------------------------------------------------------------------

export interface LaunchResult {
  vm_name: string;
  zone: string;
  project_id: string;
  launched_at: string;
  correlation_id: string;
  launcher_script: string;
  dry_run: boolean;
  events_uri: string;
  argv: string[];
}

export interface MlExperimentParams {
  asset_group: string;
  instruments: string[];
  target_types?: string[];
  timeframes?: string[];
  start_date?: string;
  end_date?: string;
  operation?: string;
  machine?: string;
  dry_run?: boolean;
}

export async function launchMlExperiment(params: MlExperimentParams): Promise<LaunchResult> {
  const response = await fetch(`${DEPLOYMENT_API}/api/ml/experiment/launch`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(params),
  });
  return handleResponse<LaunchResult>(response);
}

export interface StrategyBacktestParams {
  archetype: string;
  start_date: string;
  end_date: string;
  grid_density?: string;
  force?: boolean;
  dry_run?: boolean;
}

export async function launchStrategyBacktest(params: StrategyBacktestParams): Promise<LaunchResult> {
  const response = await fetch(`${DEPLOYMENT_API}/api/strategy/backtest/launch`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(params),
  });
  return handleResponse<LaunchResult>(response);
}

export interface ExecutionBacktestParams {
  archetype: string;
  tick_interval?: number;
  continuous?: boolean;
  force?: boolean;
  dry_run?: boolean;
}

export async function launchExecutionBacktest(params: ExecutionBacktestParams): Promise<LaunchResult> {
  const response = await fetch(`${DEPLOYMENT_API}/api/execution/backtest/launch`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(params),
  });
  return handleResponse<LaunchResult>(response);
}

// -------------------------------------------------------------------------
// Deployment diff — GET /api/deployments/diff?from_sha=<sha>&to_sha=<sha>
// -------------------------------------------------------------------------

export interface DiffEntry {
  service: string;
  from_version: string | null;
  to_version: string | null;
}

export interface DeploymentDiffResponse {
  from_sha: string;
  to_sha: string;
  added: DiffEntry[];
  removed: DiffEntry[];
  changed: DiffEntry[];
  total_changes: number;
  dry_run: boolean;
}

export async function fetchDeploymentDiff(fromSha: string, toSha: string): Promise<DeploymentDiffResponse> {
  const params = new URLSearchParams({ from_sha: fromSha, to_sha: toSha });
  const response = await fetch(`${DEPLOYMENT_API}/api/deployments/diff?${params.toString()}`);
  return handleResponse<DeploymentDiffResponse>(response);
}

// -------------------------------------------------------------------------
// VM cost estimate — POST /api/vm/cost-estimate
// -------------------------------------------------------------------------

export interface VmCostEstimateRequest {
  machine_type: string;
  runtime_hours: number;
  disk_gb?: number;
  count?: number;
}

export interface VmCostEstimateResponse {
  machine_type: string;
  runtime_hours: number;
  disk_gb: number;
  count: number;
  compute_cost_usd: number;
  disk_cost_usd: number;
  total_cost_usd: number;
  hourly_rate_usd: number;
  currency: string;
  region: string;
  dry_run: boolean;
  estimated_at: string;
  unknown_machine_type: boolean;
}

export async function fetchVmCostEstimate(req: VmCostEstimateRequest): Promise<VmCostEstimateResponse> {
  const response = await fetch(`${DEPLOYMENT_API}/api/vm/cost-estimate`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(req),
  });
  return handleResponse<VmCostEstimateResponse>(response);
}

// -------------------------------------------------------------------------
// VM log tail — polls GET /api/vm/logs/{vm_name}?tail=N
// -------------------------------------------------------------------------

export interface VmLogLine {
  timestamp: string;
  event: string;
  severity: string;
  message: string;
}

export interface VmLogTailResult {
  vm_name: string;
  service: string;
  lines: VmLogLine[];
  total_lines: number;
}

export async function fetchVmLogs(vmName: string, tail = 100): Promise<VmLogTailResult> {
  const response = await fetch(`${DEPLOYMENT_API}/api/vm/logs/${encodeURIComponent(vmName)}?tail=${tail}`);
  return handleResponse<VmLogTailResult>(response);
}

export type VmHealthState = "green" | "amber" | "red" | "unknown";

export interface VmHealthResult {
  vm_name: string;
  service: string;
  state: VmHealthState;
  last_started_at: string | null;
  last_event_at: string | null;
  last_event_type: string | null;
  expected_next_heartbeat_at: string | null;
  threshold_warn_seconds: number;
  threshold_error_seconds: number;
  is_terminal: boolean;
  scanned_hours: number;
  message: string;
}

export async function fetchVmHealth(vmName: string, scanHours = 24): Promise<VmHealthResult> {
  const response = await fetch(`${DEPLOYMENT_API}/api/vm/${encodeURIComponent(vmName)}/health?scan_hours=${scanHours}`);
  return handleResponse<VmHealthResult>(response);
}

// Cost observability — GET /api/costs/{summary,breakdown,timeseries}
// Comprehensive cross-cloud billing (GCP BigQuery + AWS CUR/Athena; GitHub dummy until PAT).
export type CostCloud = "gcp" | "aws" | "github";
export type CostDimension = "service" | "resource" | "bucket" | "region" | "day" | "sku" | "label";
// GCP business label the `label` dimension groups by (GCP-only; AWS/GitHub → "(unlabeled)").
export type CostLabelKey = "purpose" | "category" | "venue" | "asset_group";
export type CloudFilter = "all" | CostCloud;

export interface CloudSummary {
  cloud: CostCloud;
  total: number; // NET — what you actually pay (= gross + credit)
  gross: number; // usage cost before credits
  credit: number; // credits applied (<= 0)
  delta_pct: number | null;
  daily: number[];
  is_placeholder: boolean;
  // Native-currency figures for the USD⇄GBP tally toggle. GCP bills in GBP ("currency":"GBP");
  // USD-native clouds (AWS/GitHub) repeat the USD values. The USD fields above stay the primary,
  // cross-cloud-summable view; native is a per-cloud tally against that cloud's own invoice.
  currency: string;
  total_native: number;
  gross_native: number;
  credit_native: number;
}

export interface CostSummaryResponse {
  days: number;
  // Resolved window bounds (inclusive, ISO) — what the numbers actually describe. Echoed on every
  // view so an explicit range is distinguishable from a trailing preset of the same length.
  start_date?: string;
  end_date?: string;
  total: number; // NET grand total — what you actually pay
  gross: number; // usage cost before credits
  credit: number; // credits applied (<= 0)
  run_rate_daily: number;
  delta_pct: number | null;
  dates: string[];
  clouds: CloudSummary[];
  provisional_days: number;
  generated_at: string;
}

export interface CostBreakdownRow {
  label: string;
  cloud: CostCloud | null;
  cost: number; // NET — primary (matches the summary net total)
  gross: number; // usage cost before credits (Σcost for this group)
  credit: number; // credits applied to this group (<= 0); cost == gross + credit
  // Native-currency figures for the USD⇄GBP tally toggle (GCP="GBP"; USD-native clouds repeat USD).
  // Aggregate rows carry the scope currency (GBP only when the whole view is one non-USD cloud).
  currency?: string;
  cost_native?: number;
  gross_native?: number;
  credit_native?: number;
  detail: string;
  resource_kind: string;
  share_pct: number;
  is_provisional: boolean;
  // Bucket-only (dimension=bucket rows): avg GB stored over the window, storage-class split, net
  // cost / storage_gb. null when the row isn't a bucket or carries no storage-volume usage.
  storage_gb?: number | null;
  storage_class_gb?: Record<string, number> | null;
  cost_per_gb?: number | null;
  // Bucket-only: net cost split by SKU component so an operations-dominated bucket (e.g. an
  // event-log bucket that's ~all Class-A writes on a few GB) reads honestly. Keys present only
  // when non-zero: storage | operations | egress | other; they sum to ~`cost`.
  cost_by_component?: Record<string, number> | null;
  // Resource-only (dimension=resource rows): cost-waste flags — a row IS an idle static/elastic IP
  // or an orphaned disk when is_idle is true (its own `cost` is the waste amount); "" when not
  // flagged (never a false-positive orphan when the running-VM cross-ref is unavailable).
  is_idle?: boolean;
  waste_kind?: "" | "idle_static_ip" | "orphaned_disk" | "idle_elastic_ip";
  // VM rows only, parsed from GCP billing system_labels (no Compute API). "" / null when unset.
  machine_type?: string;
  vcpu?: number | null;
  memory_gb?: number | null;
  // Resource/service-only: "spot" | "on-demand" | "other" (a group shows "spot" if any of its
  // underlying SKU lines is spot-priced). "" / undefined on dimensions the axis doesn't apply to.
  purchase_option?: string;
  // True for a synthetic roll-up row — the "Other (N more)" capped-tail sum or the "Unattributed
  // (no resource id)" sum. The UI pins it to the bottom, excludes it from sort, and skips its bar.
  is_aggregate?: boolean;
}

export interface CostBreakdownResponse {
  dimension: CostDimension;
  cloud: CloudFilter;
  days: number;
  start_date?: string; // resolved window bounds (inclusive, ISO) — see CostSummaryResponse
  end_date?: string;
  total: number; // TRUE window total for this dimension (all groups, pre-cap) — consistent across tabs
  total_groups?: number; // distinct real groups before the top-N cap (excludes synthetic aggregate rows)
  rows: CostBreakdownRow[];
}

export interface CostTimeseriesPoint {
  date: string;
  values: Partial<Record<CostCloud, number>>;
}

export interface CostTimeseriesResponse {
  days: number;
  start_date?: string; // resolved window bounds (inclusive, ISO) — see CostSummaryResponse
  end_date?: string;
  clouds: CostCloud[];
  points: CostTimeseriesPoint[];
}

/** An operator-picked window. Both bounds are ISO `YYYY-MM-DD` and INCLUSIVE, matching the API. */
export interface CostDateRange {
  start: string;
  end: string;
}

/**
 * The window half of a cost query: an explicit range when given, else the trailing `days` preset.
 *
 * The API takes one or the other (`start_date`+`end_date` override `days`), so sending both would
 * leave which-one-wins to the server. Emitting exactly one keeps the request self-describing.
 */
function costWindowQs(days: number, range?: CostDateRange): string {
  return range ? `start_date=${range.start}&end_date=${range.end}` : `days=${days}`;
}

export async function fetchCostSummary(
  days = 30,
  refresh = false,
  range?: CostDateRange,
): Promise<CostSummaryResponse> {
  const qs = `?${costWindowQs(days, range)}&refresh=${refresh}`;
  const response = await fetch(`${DEPLOYMENT_API}/api/costs/summary${qs}`);
  return handleResponse<CostSummaryResponse>(response);
}

export async function fetchCostBreakdown(
  dimension: CostDimension,
  cloud: CloudFilter = "all",
  days = 30,
  refresh = false,
  labelKey: CostLabelKey = "purpose",
  range?: CostDateRange,
): Promise<CostBreakdownResponse> {
  const label = dimension === "label" ? `&label_key=${labelKey}` : "";
  const qs = `?dimension=${dimension}&cloud=${cloud}&${costWindowQs(days, range)}&refresh=${refresh}${label}`;
  const response = await fetch(`${DEPLOYMENT_API}/api/costs/breakdown${qs}`);
  return handleResponse<CostBreakdownResponse>(response);
}

export async function fetchCostTimeseries(
  days = 30,
  cloud: CloudFilter = "all",
  refresh = false,
  range?: CostDateRange,
): Promise<CostTimeseriesResponse> {
  const qs = `?${costWindowQs(days, range)}&cloud=${cloud}&refresh=${refresh}`;
  const response = await fetch(`${DEPLOYMENT_API}/api/costs/timeseries${qs}`);
  return handleResponse<CostTimeseriesResponse>(response);
}

// ── Artifact pipeline — GET /api/artifacts/{builds,deploys,images,running,health} ──────────────────
// The build → artifact → deploy estate, end-to-end across GCP (active) and AWS (parked). The builds
// view is the first live backend; the other four land per-view. Mirrors the Python contract in
// deployment_api/services/artifact_pipeline/models.py — keep the fields in lockstep.
export type ArtifactCloud = "gcp" | "aws";
export type ArtifactLane = "image" | "tarball";

/** One step in a build's timeline (Cloud Build step / CodeBuild phase), for the row drawer. */
export interface BuildStep {
  name: string;
  status: string;
  seconds: number;
}

/** One build record — a Cloud Build / CodeBuild run in either lane, normalised. */
export interface BuildRow {
  repo: string;
  lane: ArtifactLane;
  cloud: ArtifactCloud;
  status: string; // SUCCESS | FAILURE | WORKING | QUEUED | …
  trigger: string;
  sha: string; // short (7)
  branch: string;
  started_at: string; // ISO
  duration: string; // pre-formatted "3m41s" / "41s" / "" when unknown
  produced: string; // first produced image ref, or ""
  build_id: string;
  failure: string; // one-line reason ("" unless FAILURE)
  failure_type: string;
  failure_detail: string;
  log_url: string;
  dup: boolean; // same (repo, sha) built >1× in window (wasted)
  cross_lane: boolean; // one commit built as image AND tarball
  steps: BuildStep[];
}

/** Stat-tile figures — computed over the whole window, never the filtered subset. */
export interface BuildsStats {
  total: number;
  success_rate: number; // % of completed builds that succeeded
  failed: number;
  median_duration_sec: number | null;
  wasted_dup: number; // extra builds of an already-built commit
}

/** The Pipeline view envelope. `start_date`/`end_date` echo the resolved window (inclusive, ISO). */
export interface BuildsResponse {
  days: number;
  start_date: string;
  end_date: string;
  generated_at: string;
  rows: BuildRow[];
  stats: BuildsStats;
}

/** The window/filter half of an artifact-pipeline query. An explicit range overrides `days`. */
export interface ArtifactQuery {
  days?: number;
  cloud?: "all" | ArtifactCloud;
  lane?: "all" | ArtifactLane;
  status?: "all" | "failed";
  startDate?: string; // ISO YYYY-MM-DD (inclusive)
  endDate?: string;
  refresh?: boolean;
}

/** GET /api/artifacts/builds — recent build history, both clouds + both lanes. */
export async function getArtifactBuilds(query: ArtifactQuery = {}): Promise<BuildsResponse> {
  const qs = new URLSearchParams();
  if (query.startDate && query.endDate) {
    qs.set("start_date", query.startDate);
    qs.set("end_date", query.endDate);
  } else if (query.days != null) {
    qs.set("days", String(query.days));
  }
  if (query.cloud && query.cloud !== "all") qs.set("cloud", query.cloud);
  if (query.lane && query.lane !== "all") qs.set("lane", query.lane);
  if (query.status && query.status !== "all") qs.set("status", query.status);
  if (query.refresh) qs.set("refresh", "true");
  // Bound the wait: the backend reads live cloud APIs, and a stale gRPC channel can be slow. Without
  // an abort the page's spinner hangs forever; 45s clears a cold multi-page scan yet still fails loud.
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 45_000);
  try {
    const response = await fetch(`${DEPLOYMENT_API}/api/artifacts/builds?${qs.toString()}`, {
      signal: controller.signal,
    });
    return await handleResponse<BuildsResponse>(response);
  } catch (err) {
    if (err instanceof DOMException && err.name === "AbortError") {
      throw new Error("Timed out after 45s — the deployment API is slow or unreachable.");
    }
    throw err;
  } finally {
    clearTimeout(timer);
  }
}

// Filtered VM events — GET /api/vm/{vm_name}/events?since=&type=&limit=
export interface VMLifecycleEvent {
  event: string;
  service: string;
  timestamp: string;
  severity: string;
  correlation_id: string | null;
  details: Record<string, string> | null;
}

export interface VMEventListResult {
  vm_name: string;
  service: string;
  date: string;
  hours_scanned: number[];
  total_events: number;
  events: VMLifecycleEvent[];
  truncated: boolean;
  next_page_token: string | null;
}

export async function fetchVmFilteredEvents(
  vmName: string,
  opts: { since?: string; type?: string; limit?: number } = {},
): Promise<VMEventListResult> {
  const params = new URLSearchParams();
  if (opts.since) params.set("since", opts.since);
  if (opts.type) params.set("type", opts.type);
  if (opts.limit != null) params.set("limit", String(opts.limit));
  const qs = params.toString() ? `?${params.toString()}` : "";
  const response = await fetch(`${DEPLOYMENT_API}/api/vm/${encodeURIComponent(vmName)}/events${qs}`);
  return handleResponse<VMEventListResult>(response);
}

// -------------------------------------------------------------------------
// Venue credentials — GET /api/venue-credentials
// Returns per-venue API key name + status. Key values are NEVER returned.
// -------------------------------------------------------------------------

export type VenueCredentialStatusValue = "active" | "expired" | "missing" | "error" | "mock" | string;

export interface VenueCredentialStatus {
  name: string;
  venue: string;
  status: VenueCredentialStatusValue;
  probe_detail: string | null;
  checked_at: string;
}

export async function fetchVenueCredentials(): Promise<VenueCredentialStatus[]> {
  const response = await fetch(`${DEPLOYMENT_API}/api/venue-credentials`);
  return handleResponse<VenueCredentialStatus[]>(response);
}

// -------------------------------------------------------------------------
// Venue Date Ranges — §3.P2: free-tier vs paid-tier fetchable date ranges
// -------------------------------------------------------------------------

export interface VenueDateRangeInfo {
  venue: string;
  key_name: string;
  key_status: string;
  coverage_start: string;
  free_date_count: number;
  paid_date_count: number;
  free_description: string;
  paid_description: string;
  free_sample_dates: string[];
  assessed_at: string;
}

export async function fetchVenueDateRanges(): Promise<VenueDateRangeInfo[]> {
  const response = await fetch(`${DEPLOYMENT_API}/api/venue-date-ranges`);
  return handleResponse<VenueDateRangeInfo[]>(response);
}

// -------------------------------------------------------------------------
// Venue Relaunch Estimate — §4.P2: cells unlockable now vs after key renewal
// -------------------------------------------------------------------------

export interface RelaunchEstimateRow {
  venue: string;
  asset_group: string;
  year: number;
  pending_total: number;
  est_now_unlockable: number;
  est_after_renewal: number;
  free_pct: number;
}

export interface RelaunchEstimateSummary {
  total_pending: number;
  total_now_unlockable: number;
  total_after_renewal: number;
  key_status: string;
}

export interface VenueRelaunchEstimateResponse {
  rows: RelaunchEstimateRow[];
  summary: RelaunchEstimateSummary;
  assessed_at: string;
}

export async function fetchVenueRelaunchEstimate(): Promise<VenueRelaunchEstimateResponse> {
  const response = await fetch(`${DEPLOYMENT_API}/api/venue-relaunch-estimate`);
  return handleResponse<VenueRelaunchEstimateResponse>(response);
}

// -------------------------------------------------------------------------
// Venue Tardis Windows — GET /api/data-status/venue-tardis-windows
// Returns Tardis free-tier access rules + current key status.
// -------------------------------------------------------------------------

export interface TardisFreeTierRules {
  rolling_window_days: number;
  rolling_window_cutoff: string;
  monthly_firsts: boolean;
  rule_description: string;
}

export interface VenueTardisWindowsResponse {
  as_of: string;
  key_name: string;
  key_status: VenueCredentialStatusValue;
  free_tier: TardisFreeTierRules;
}

export async function fetchVenueTardisWindows(): Promise<VenueTardisWindowsResponse> {
  const response = await fetch(`${DEPLOYMENT_API}/api/data-status/venue-tardis-windows`);
  return handleResponse<VenueTardisWindowsResponse>(response);
}

// -------------------------------------------------------------------------
// Deployment observability — unified inventory of every VM + Cloud Run job,
// classified under a live/batch/paper umbrella × cloud (GCP/AWS). Mirrors the
// /repos CI surface for deployments. Backend: deployment-api@5df5f01
//   GET /api/deployments/inventory?umbrella=&cloud=&service=&asset_group=&status=
//   GET /api/deployments/umbrella/{umbrella}/summary
// Plan: deployment_observability_parity_live_batch_paper_2026_06_22.md Phase 2.
// -------------------------------------------------------------------------

// NONE = an always-on service (Cloud Run service / ECS / Lambda / Cloud Function) — no
// live/batch/paper phase, so the Mode column renders "—" and it's found via the Kind filter.
export type DeploymentUmbrella = "LIVE" | "BATCH" | "PAPER" | "EXPERIMENT" | "NONE";
// All 6 kinds are backend-live as of the deployment-obs backend plan (2026-07-09):
// VM · CLOUD_RUN_JOB · CLOUD_RUN_SERVICE · ECS_SERVICE · LAMBDA · CLOUD_FUNCTION.
export type DeploymentKind =
  | "VM"
  | "CLOUD_RUN_JOB"
  | "CLOUD_RUN_SERVICE"
  | "ECS_SERVICE"
  | "LAMBDA"
  | "CLOUD_FUNCTION"
  // WS-D full-estate additions: orphaned resources + scheduled-job liveness.
  | "DISK" // an unattached persistent disk with no owning VM (still billing)
  | "STATIC_IP" // a reserved static IP with no owner (idle-billed)
  | "SCHEDULER"; // a Cloud Scheduler job — the "fired on time?" signal
export type DeploymentCloud = "GCP" | "AWS";
/** Status taxonomy mirrored from the inventory route — color-coded like RepoCi. */
export type DeploymentStatus = "succeeded" | "failed" | "running" | "stale" | "unknown" | string;

// Composite WORK-health — server-derived (`DeploymentItem.composite_health_status`) from the
// metric vector + manifest write-truth + control-plane existence (parent D.3). Distinguishes
// "alive but doing nothing" from genuinely working. Backend currently emits working/oom-risk/
// disk-full/hung/unknown; `stalled` + `workload-dead` land when the open backend P1 finishes.
export type VmHealth =
  | "working" // resource in-band AND objects landing / bytes flowing
  | "stalled" // fresh heartbeat but flat progress + idle cpu/net (e.g. dead websocket)
  | "oom-risk" // mem climbing toward the limit — alert BEFORE the kill
  | "workload-dead" // daemon still heartbeating but the workload PID is gone (OOM-killed)
  | "disk-full" // disk >90% — writes failing silently
  | "hung" // heartbeat stale but the control-plane still says RUNNING (whole-VM wedge)
  | "dead" // control-plane reports the instance not running
  // Cloud Scheduler verdicts (WS-D #9) — the "fired on time?" signal on SCHEDULER rows.
  | "overdue" // next fire is past + grace, or the last attempt failed
  | "on-time" // firing on cadence, last attempt ok
  | "paused" // paused/disabled — intentionally not firing
  | "unknown"; // no derivable verdict for this kind/target

// Service (Cloud Run service / ECS) health — desired-vs-running / ready-state (parent D.3).
export type ServiceHealth = "serving" | "scaled-to-zero" | "dead" | "degraded" | "unknown";

// Mirrors deployment-api `DeploymentItem` (deployments_inventory.py:176) — the thin list row.
/** One billable resource a non-running VM / orphaned row still holds (WS-D leaked cost). The
 *  `est_monthly_usd` is an inferred list-rate estimate (principle 8), never a billing figure —
 *  `cost_basis` labels it so the UI renders the "est. / refresh periodically" marker. */
export interface UnreleasedResource {
  type: "DISK" | "STATIC_IP";
  name: string;
  size_gb?: number | null;
  disk_type?: string | null; // pd-standard / pd-ssd / … (DISK only)
  est_monthly_usd: number;
  cost_basis?: string | null; // "inferred" — always a list-rate estimate, never billing-derived
}

export interface DeploymentItem {
  name: string;
  kind: DeploymentKind;
  umbrella: DeploymentUmbrella; // NONE → services; Mode column shows "—"
  cloud: DeploymentCloud;
  service: string;
  asset_group: string;
  status: DeploymentStatus;
  last_run_at: string | null;
  exit_code: number | null;
  heartbeat_age_seconds: number | null;
  captured_progress: number | null;
  run_log_uri: string | null;
  // Provenance (WS-D full-estate) — who launched this compute unit. "deployment-api" = has a
  // deployment registry entry / registered Cloud Run job; "control-plane" = long-lived managed
  // infra with no registry entry (control-plane VMs, Cloud Run services, Cloud Functions);
  // "adhoc" = live but unaccounted (an ad-hoc/stranded launch — reconciliation's UNKNOWN set);
  // "unknown" = no provenance signal yet (the AWS estate until the managed-by tag lands). Nullable
  // on legacy rows until the census populates it.
  launched_by?: string | null;
  // Last DEPLOY/modify time — distinct from last_run_at (last INVOKE). Carries fn.last_modified for
  // AWS Lambda (whose last_run_at is honestly-absent — no paid CloudWatch), so the UI shows
  // last-*modified* + a tooltip, never a mislabelled last-run (WS-D #10). None for other kinds.
  last_modified_at?: string | null;
  // Leaked/unreleased resources (WS-D) — a NON-running VM (or an orphaned DISK/STATIC_IP row) still
  // holding billable resources. has_unreleased_resources is null when it couldn't be determined
  // (honest absence, never a false "clean"); each unreleased item carries an inferred est_monthly_usd.
  has_unreleased_resources?: boolean | null;
  unreleased_resources?: UnreleasedResource[] | null;
  // Tier-0 free wins — GCE aggregated-list / registry entry (on the thin list).
  rows_in?: number | null;
  rows_error?: number | null;
  events_emitted?: number | null;
  uptime_hours?: number | null;
  machine_type?: string | null; // e2-highmem-8 · m7i.xlarge
  zone?: string | null; // asia-northeast1-c · ap-northeast-1
  health_status?: string | null; // raw GCE instance status (RUNNING/TERMINATED/…)
  boot_disk_name?: string | null;
  labels?: Record<string, string> | null;
  // Composite work-health — the Health column.
  composite_health_status?: VmHealth | ServiceHealth | null;
  // Resource summary scalars for the INLINE Resources column. The full D.1 vector
  // (io/net/workload_alive) lives on DeploymentDetail (/detail); these summary scalars
  // need surfacing on the thin list — recommended backend addition (plan Progress Log
  // 2026-07-09). mem_slope>0 drives the inline "↑" climbing indicator.
  cpu_pct?: number | null;
  mem_pct?: number | null;
  disk_pct?: number | null;
  mem_slope?: number | null; // %/min trend → OOM prediction (sustained climb)
  // AWS ECS_SERVICE structural fields (Open-Q7 desired-vs-running).
  cluster?: string | null;
  desired_count?: number | null;
  running_count?: number | null;
  task_definition_revision?: number | null;
  // AWS LAMBDA structural fields.
  runtime?: string | null; // "" for a container-image function
  memory_size_mb?: number | null;
  package_type?: string | null; // "Zip" | "Image"
  // Cloud Run service.
  revision?: string | null; // latest ready/created revision
  region?: string | null; // serving region
  // Cost-per-target (WS-E) — three USD figures joined from the billing exports (all USD; GCP is
  // GBP→USD-converted server-side, so no currency toggle here). Null when the resource has no
  // billing row yet (export lag / no resource granularity — honest absence, never a fabricated 0).
  cost_actual_usd?: number | null; // net cost on the most recent complete billing day
  cost_avg_7d_usd?: number | null; // trailing-7-day average daily net cost
  cost_projected_24h_usd?: number | null; // projected $/day if it runs 24h (peak observed day)
  // "complete" | "partial" | null (no billing row yet). "partial" means cost_actual_usd /
  // cost_projected_24h_usd fall back to a still-accruing day (no complete billing day exists yet)
  // — the UI colour-codes off this, no text label (decision 4, 2026-07-20).
  cost_basis?: "complete" | "partial" | null;
  // WS-2 date-range overlap (raw registry interval, ISO) — null for kinds with no registry entry
  // (Cloud Run jobs/services, unmanaged VMs, ...). Distinct from last_run_at (which conflates
  // started/completed for display) because the overlap formula needs the two bounds separately.
  started_at?: string | null;
  completed_at?: string | null;
  last_heartbeat_at?: string | null;
  // Honest-uncertainty marker (WS-2 decision 4) — "approx" when the effective last-run/overlap
  // date is DERIVED rather than authoritative (a heartbeat-stale VM's effective end, a
  // single-timestamp kind, or the unmanaged-VM fallback). null = authoritative. Colour-only in the
  // UI, no text label — same convention as cost_basis "partial".
  basis?: "approx" | null;
  // Orphan/idle-spend join (Fleet-tab consolidation) — reused verbatim from the SAME
  // GET /api/fleet/orphans SSOT (never a second estimator). Populated ONLY for a VM row currently
  // STOPPED/SUSPENDED/TERMINATED; null for a running VM or any non-VM kind (honest absence).
  reap_verdict?: OrphanVerdict | null;
  grace_hours?: number | null; // the stopped-age threshold (hours) the verdict was computed against
  stopped_age_hours?: number | null; // hours since last_stop_timestamp (falls back to creation)
  monthly_disk_usd?: number | null; // ESTIMATE — same list-rate model as /api/fleet/orphans
}

// GET /api/deployments/{name}/detail → deployment-api `DeploymentDetailResponse`
// (deployments_inventory.py:237): the thin item + the deep D.1 metric vector. All metric
// fields are null for a kind without /proc capture (Cloud Run/ECS/Lambda) or a target
// absent from this census cycle (honest absence, never a fabricated 0.0).
export interface JobExecutionRecord {
  name: string;
  status: string;
  started_at?: string | null;
  completed_at?: string | null;
  duration_seconds?: number | null;
}

export interface DeploymentDetail {
  item: DeploymentItem;
  cpu_pct: number | null;
  mem_pct: number | null;
  mem_slope: number | null;
  disk_pct: number | null;
  io_write_rate_bytes_sec: number | null;
  net_recv_rate_bytes_sec: number | null;
  workload_alive: boolean | null;
  // Cloud Run job run-history — last ~10 executions (newest first), for "did it fire on cadence"
  // (WS-D #11). [] for non-job kinds.
  run_history?: JobExecutionRecord[];
  // Job → manifest bridge HINT — rows since the last manifest snapshot for the job's asset_group
  // ("rows since last run", WS-D #12). A link + hint; the authoritative "did it produce data"
  // verdict lives on the consolidator page. null for non-jobs.
  object_delta?: number | null;
}

export interface DeploymentInventoryResponse {
  items: DeploymentItem[];
  total: number;
  vm_count: number;
  cloud_run_job_count: number;
  // WS-2 date-range archive floor (decision 5) — set only when the request carried date_from/
  // date_to. `archive_floor` is the earliest day the archive actually retains (the real 30-day
  // GCS TTL); `date_range_out_of_range` is true when the requested date_from predates it, so the
  // UI shows an explicit "no data before <archive_floor>" banner instead of a silent partial
  // result. Undefined/false for a request with no date filter.
  archive_floor?: string | null;
  date_range_out_of_range?: boolean;
}

export interface UmbrellaLastFailure {
  name: string;
  exit_code: number | null;
  last_run_at: string | null;
}

export interface UmbrellaSummaryResponse {
  umbrella: DeploymentUmbrella;
  total: number;
  counts_by_status: Record<string, number>;
  stale_count: number;
  last_failure: UmbrellaLastFailure | null;
}

export interface DeploymentInventoryFilters {
  umbrella?: DeploymentUmbrella;
  cloud?: DeploymentCloud;
  service?: string;
  asset_group?: string;
  status?: string;
  /** GCP region to census (empty/default = configured region; "all" = every region). */
  region?: string;
  // WS-2 date-range overlap query (`?date_from=&date_to=`) — `YYYY-MM-DD` (a bare date is
  // inclusive of its whole day) or a full ISO-8601 instant. Scopes VM/registry + single-timestamp
  // rows to those overlapping [date_from, date_to]; kinds with no timestamp signal at all pass
  // through unfiltered (honest absence, deployment-api `_apply_date_range`).
  date_from?: string;
  date_to?: string;
}

export interface DeploymentRegionsResponse {
  /** The region the selector opens on. */
  default: string;
  /** Selectable GCP regions (default pinned first), dynamic from the live compute region list. */
  regions: string[];
  /** The sentinel to pass as `region` to sweep every region. */
  all_value: string;
}

export async function getDeploymentInventory(
  filters: DeploymentInventoryFilters = {},
): Promise<DeploymentInventoryResponse> {
  const params = new URLSearchParams();
  if (filters.umbrella) params.set("umbrella", filters.umbrella);
  if (filters.cloud) params.set("cloud", filters.cloud);
  if (filters.service) params.set("service", filters.service);
  if (filters.asset_group) params.set("asset_group", filters.asset_group);
  if (filters.status) params.set("status", filters.status);
  if (filters.region) params.set("region", filters.region);
  if (filters.date_from) params.set("date_from", filters.date_from);
  if (filters.date_to) params.set("date_to", filters.date_to);
  const qs = params.toString() ? `?${params.toString()}` : "";
  const response = await fetch(`${DEPLOYMENT_API}/api/deployments/inventory${qs}`);
  return handleResponse<DeploymentInventoryResponse>(response);
}

export async function getDeploymentRegions(): Promise<DeploymentRegionsResponse> {
  const response = await fetch(`${DEPLOYMENT_API}/api/deployments/regions`);
  return handleResponse<DeploymentRegionsResponse>(response);
}

export async function getUmbrellaSummary(umbrella: DeploymentUmbrella): Promise<UmbrellaSummaryResponse> {
  const response = await fetch(`${DEPLOYMENT_API}/api/deployments/umbrella/${encodeURIComponent(umbrella)}/summary`);
  return handleResponse<UmbrellaSummaryResponse>(response);
}

// GET /api/deployments/{name}/detail — the per-target drill-down (thin item + the deep D.1
// metric vector). deployment-api DeploymentDetailResponse (deployments_inventory.py:238).
export async function getDeploymentDetail(name: string): Promise<DeploymentDetail> {
  const response = await fetch(`${DEPLOYMENT_API}/api/deployments/${encodeURIComponent(name)}/detail`);
  return handleResponse<DeploymentDetail>(response);
}

// -------------------------------------------------------------------------
// run.log viewer (WS-4, deployment_ui_vm_log_viewer_2026_07_20.md) — size,
// bounded tail, signed-URL download for a VM's actual run.log content. Mirrors
// deployment-api `RunLogMetadataResponse`/`RunLogTailResponse`/`RunLogDownloadResponse`
// (deployments_inventory.py). `location` is "live" | "archive" | null: null means neither
// the live vm-logs/ path nor the durable final-snapshot archive path has an object yet
// (honest "no log available", never a fabricated hit).
// -------------------------------------------------------------------------

export interface RunLogMetadata {
  name: string;
  exists: boolean;
  location: "live" | "archive" | null;
  uri: string;
  size_bytes: number | null;
  last_modified: string | null;
}

export interface RunLogTail {
  name: string;
  exists: boolean;
  location: "live" | "archive" | null;
  uri: string;
  size_bytes: number | null;
  last_modified: string | null;
  lines: string[];
  line_count: number;
  tail_bytes: number;
}

export interface RunLogDownload {
  name: string;
  exists: boolean;
  location: "live" | "archive" | null;
  download_url: string;
  expires_in_seconds: number;
}

export async function getRunLogMetadata(name: string): Promise<RunLogMetadata> {
  const response = await fetch(`${DEPLOYMENT_API}/api/deployments/${encodeURIComponent(name)}/run-log/metadata`);
  return handleResponse<RunLogMetadata>(response);
}

export async function getRunLogTail(name: string, lines?: number): Promise<RunLogTail> {
  const qs = lines != null ? `?lines=${lines}` : "";
  const response = await fetch(`${DEPLOYMENT_API}/api/deployments/${encodeURIComponent(name)}/run-log/tail${qs}`);
  return handleResponse<RunLogTail>(response);
}

export async function getRunLogDownload(name: string): Promise<RunLogDownload> {
  const response = await fetch(`${DEPLOYMENT_API}/api/deployments/${encodeURIComponent(name)}/run-log/download`);
  return handleResponse<RunLogDownload>(response);
}
