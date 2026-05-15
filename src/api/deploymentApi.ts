import type {
  DeployJob,
  DeployParams,
  ServiceStatus,
} from "../types/deploymentTypes";

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

export async function fetchDeploymentHistory(
  serviceId?: string,
): Promise<DeployJob[]> {
  const query = serviceId ? `?service_id=${serviceId}` : "";
  const response = await fetch(`${DEPLOYMENT_API}/api/deployments${query}`);
  return handleResponse<DeployJob[]>(response);
}

export async function rollbackDeployment(jobId: string): Promise<DeployJob> {
  const response = await fetch(
    `${DEPLOYMENT_API}/api/deployments/${jobId}/rollback`,
    {
      method: "POST",
    },
  );
  return handleResponse<DeployJob>(response);
}

export async function fetchBuilds(
  service: string,
  env: BuildEnvironment,
): Promise<BuildEntry[]> {
  const response = await fetch(
    `${DEPLOYMENT_API}/api/builds/${encodeURIComponent(service)}?env=${env}`,
  );
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
}

export interface VmDeploymentsListResponse {
  active: VmDeploymentEntry[];
  recent: VmDeploymentEntry[];
  archive_days: number;
}

export async function fetchVmDeployments(
  days = 7,
): Promise<VmDeploymentsListResponse> {
  const response = await fetch(
    `${DEPLOYMENT_API}/api/vm-deployments?days=${days}`,
  );
  return handleResponse<VmDeploymentsListResponse>(response);
}

export async function fetchVmDeployment(
  deploymentId: string,
): Promise<VmDeploymentEntry> {
  const response = await fetch(
    `${DEPLOYMENT_API}/api/vm-deployments/${encodeURIComponent(deploymentId)}`,
  );
  return handleResponse<VmDeploymentEntry>(response);
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

export async function fetchVmDeploymentEvents(
  deploymentId: string,
): Promise<DeploymentEventsResponse> {
  const response = await fetch(
    `${DEPLOYMENT_API}/api/deployments/${encodeURIComponent(deploymentId)}/events`,
  );
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
  const response = await fetch(
    `${DEPLOYMENT_API}/api/deployments/${encodeURIComponent(service)}/deploy`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ image_tag: imageTag, environment }),
    },
  );
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

export async function getVmEvents(
  vmName: string,
  date?: string,
): Promise<VmEventsResponse> {
  const params = new URLSearchParams();
  params.append("vm_name", vmName);
  if (date) params.append("date", date);
  const response = await fetch(
    `${DEPLOYMENT_API}/api/vm/events?${params.toString()}`,
  );
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

export async function launchMlExperiment(
  params: MlExperimentParams,
): Promise<LaunchResult> {
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

export async function launchStrategyBacktest(
  params: StrategyBacktestParams,
): Promise<LaunchResult> {
  const response = await fetch(
    `${DEPLOYMENT_API}/api/strategy/backtest/launch`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(params),
    },
  );
  return handleResponse<LaunchResult>(response);
}

export interface ExecutionBacktestParams {
  archetype: string;
  tick_interval?: number;
  continuous?: boolean;
  force?: boolean;
  dry_run?: boolean;
}

export async function launchExecutionBacktest(
  params: ExecutionBacktestParams,
): Promise<LaunchResult> {
  const response = await fetch(
    `${DEPLOYMENT_API}/api/execution/backtest/launch`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(params),
    },
  );
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

export async function fetchDeploymentDiff(
  fromSha: string,
  toSha: string,
): Promise<DeploymentDiffResponse> {
  const params = new URLSearchParams({ from_sha: fromSha, to_sha: toSha });
  const response = await fetch(
    `${DEPLOYMENT_API}/api/deployments/diff?${params.toString()}`,
  );
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

export async function fetchVmCostEstimate(
  req: VmCostEstimateRequest,
): Promise<VmCostEstimateResponse> {
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

export async function fetchVmLogs(
  vmName: string,
  tail = 100,
): Promise<VmLogTailResult> {
  const response = await fetch(
    `${DEPLOYMENT_API}/api/vm/logs/${encodeURIComponent(vmName)}?tail=${tail}`,
  );
  return handleResponse<VmLogTailResult>(response);
}
