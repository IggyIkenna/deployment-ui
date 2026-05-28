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

// Daily cost aggregation — GET /api/costs/daily
export interface VmCostRow {
  vm_name: string;
  asset_group: string;
  archetype: string;
  machine_type: string;
  runtime_hours: number;
  compute_usd: number;
  disk_usd: number;
  total_usd: number;
}

export interface AssetGroupCostRow {
  asset_group: string;
  total_usd: number;
  vm_count: number;
}

export interface ArchetypeCostRow {
  archetype: string;
  total_usd: number;
  vm_count: number;
}

export interface DailyCostResponse {
  date: string;
  total_usd: number;
  by_asset_group: AssetGroupCostRow[];
  by_archetype: ArchetypeCostRow[];
  by_vm: VmCostRow[];
}

export async function fetchDailyCosts(date?: string): Promise<DailyCostResponse> {
  const qs = date ? `?date=${encodeURIComponent(date)}` : "";
  const response = await fetch(`${DEPLOYMENT_API}/api/costs/daily${qs}`);
  return handleResponse<DailyCostResponse>(response);
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
