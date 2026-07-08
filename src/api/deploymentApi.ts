import type { DeployJob, DeployParams, ServiceStatus } from "../types/deploymentTypes";

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
export type CostDimension = "service" | "resource" | "bucket" | "region" | "day" | "sku";
export type CloudFilter = "all" | CostCloud;

export interface CloudSummary {
  cloud: CostCloud;
  total: number; // NET — what you actually pay (= gross + credit)
  gross: number; // usage cost before credits
  credit: number; // credits applied (<= 0)
  delta_pct: number | null;
  daily: number[];
  is_placeholder: boolean;
}

export interface CostSummaryResponse {
  days: number;
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
  detail: string;
  resource_kind: string;
  share_pct: number;
  is_provisional: boolean;
  // Bucket-only (dimension=bucket rows): avg GB stored over the window, storage-class split, net
  // cost / storage_gb. null when the row isn't a bucket or carries no storage-volume usage.
  storage_gb?: number | null;
  storage_class_gb?: Record<string, number> | null;
  cost_per_gb?: number | null;
}

export interface CostBreakdownResponse {
  dimension: CostDimension;
  cloud: CloudFilter;
  days: number;
  total: number;
  rows: CostBreakdownRow[];
}

export interface CostTimeseriesPoint {
  date: string;
  values: Partial<Record<CostCloud, number>>;
}

export interface CostTimeseriesResponse {
  days: number;
  clouds: CostCloud[];
  points: CostTimeseriesPoint[];
}

export async function fetchCostSummary(days = 30, refresh = false): Promise<CostSummaryResponse> {
  const response = await fetch(`${DEPLOYMENT_API}/api/costs/summary?days=${days}&refresh=${refresh}`);
  return handleResponse<CostSummaryResponse>(response);
}

export async function fetchCostBreakdown(
  dimension: CostDimension,
  cloud: CloudFilter = "all",
  days = 30,
  refresh = false,
): Promise<CostBreakdownResponse> {
  const qs = `?dimension=${dimension}&cloud=${cloud}&days=${days}&refresh=${refresh}`;
  const response = await fetch(`${DEPLOYMENT_API}/api/costs/breakdown${qs}`);
  return handleResponse<CostBreakdownResponse>(response);
}

export async function fetchCostTimeseries(
  days = 30,
  cloud: CloudFilter = "all",
  refresh = false,
): Promise<CostTimeseriesResponse> {
  const qs = `?days=${days}&cloud=${cloud}&refresh=${refresh}`;
  const response = await fetch(`${DEPLOYMENT_API}/api/costs/timeseries${qs}`);
  return handleResponse<CostTimeseriesResponse>(response);
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

export type DeploymentUmbrella = "LIVE" | "BATCH" | "PAPER" | "EXPERIMENT";
export type DeploymentKind = "VM" | "CLOUD_RUN_JOB";
export type DeploymentCloud = "GCP" | "AWS";
/** Status taxonomy mirrored from the inventory route — color-coded like RepoCi. */
export type DeploymentStatus = "succeeded" | "failed" | "running" | "stale" | "unknown" | string;

export interface DeploymentItem {
  name: string;
  kind: DeploymentKind;
  umbrella: DeploymentUmbrella;
  cloud: DeploymentCloud;
  service: string;
  asset_group: string;
  status: DeploymentStatus;
  last_run_at: string | null;
  exit_code: number | null;
  heartbeat_age_seconds: number | null;
  captured_progress: number | null;
  run_log_uri: string | null;
}

export interface DeploymentInventoryResponse {
  items: DeploymentItem[];
  total: number;
  vm_count: number;
  cloud_run_job_count: number;
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
  const qs = params.toString() ? `?${params.toString()}` : "";
  const response = await fetch(`${DEPLOYMENT_API}/api/deployments/inventory${qs}`);
  return handleResponse<DeploymentInventoryResponse>(response);
}

export async function getUmbrellaSummary(umbrella: DeploymentUmbrella): Promise<UmbrellaSummaryResponse> {
  const response = await fetch(`${DEPLOYMENT_API}/api/deployments/umbrella/${encodeURIComponent(umbrella)}/summary`);
  return handleResponse<UmbrellaSummaryResponse>(response);
}
