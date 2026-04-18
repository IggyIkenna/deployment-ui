import type {
  ServiceStatus,
  DeployParams,
  DeployJob,
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
  category: string;
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
