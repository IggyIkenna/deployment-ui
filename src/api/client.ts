// ---------------------------------------------------------------------------
// Local API client (replaces @unified-admin/core dependency)
// ---------------------------------------------------------------------------

interface ApiClientOptions {
  timeoutMs?: number;
}

class ApiClientError extends Error {
  status: number;
  code: string;
  constructor(opts: { status: number; code: string; message: string }) {
    super(opts.message);
    this.name = "ApiClientError";
    this.status = opts.status;
    this.code = opts.code;
  }
}

interface ApiClient {
  get<T>(url: string, opts?: RequestInit): Promise<T>;
  post<T>(url: string, body?: unknown, opts?: RequestInit): Promise<T>;
  put<T>(url: string, body?: unknown, opts?: RequestInit): Promise<T>;
  delete<T>(url: string, opts?: RequestInit): Promise<T>;
}

function createClientConfig(baseUrl: string, options?: ApiClientOptions): { baseUrl: string; timeoutMs: number } {
  return { baseUrl, timeoutMs: options?.timeoutMs ?? 120_000 };
}

function createApiClient(config: { baseUrl: string; timeoutMs: number }): ApiClient {
  async function request<T>(method: string, url: string, body?: unknown, opts?: RequestInit): Promise<T> {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), config.timeoutMs);
    try {
      const headers: Record<string, string> = {
        "Content-Type": "application/json",
        Accept: "application/json",
      };
      const response = await fetch(`${config.baseUrl}${url}`, {
        method,
        headers,
        body: body !== undefined ? JSON.stringify(body) : undefined,
        signal: opts?.signal ?? controller.signal,
      });
      if (!response.ok) {
        const error = await response.json().catch(() => ({ detail: "Unknown error" }));
        throw new ApiClientError({
          status: response.status,
          code: `HTTP_${response.status}`,
          message: error.detail || `HTTP ${response.status}`,
        });
      }
      if (response.status === 204) return undefined as T;
      return response.json();
    } finally {
      clearTimeout(timeoutId);
    }
  }

  return {
    get: <T>(url: string, opts?: RequestInit) => request<T>("GET", url, undefined, opts),
    post: <T>(url: string, body?: unknown, opts?: RequestInit) => request<T>("POST", url, body, opts),
    put: <T>(url: string, body?: unknown, opts?: RequestInit) => request<T>("PUT", url, body, opts),
    delete: <T>(url: string, opts?: RequestInit) => request<T>("DELETE", url, undefined, opts),
  };
}

// ---------------------------------------------------------------------------

import type {
  AssetGroupStartDates,
  AssetGroupVenuesResponse,
  ChecklistResponse,
  ChecklistSummary,
  ChecklistValidateResponse,
  CreateDeploymentResponse,
  DataStatusResponse,
  DependenciesResponse,
  Deployment,
  DeploymentEventStream,
  DeploymentRequest,
  DimensionStatus,
  DiscoverConfigsResponse,
  EpicDetail,
  EpicSummary,
  HealthResponse,
  LiveHealthStatus,
  MissingShardsResponse,
  RollbackRequest,
  RollbackResponse,
  Service,
  ServiceDimensionsResponse,
  ServiceStatus,
  ServicesOverview,
  StartDatesResponse,
  VenuesResponse,
} from "../types";

/**
 * Dynamic API base URL — updated when the cloud provider toggle switches.
 * Default: "/api" (proxied by Vite to the deployment-api dev port).
 * When explicitly set via ``setApiBaseUrl``: an absolute URL read from
 * ``import.meta.env.VITE_API_BASE_URL`` (or the cloud-provider toggle).
 */
let API_BASE = "/api";
let apiClient: ApiClient = createApiClient(createClientConfig(API_BASE));

/** Switch the API backend URL. Called by CloudProviderContext on toggle. */
export function setApiBaseUrl(baseUrl: string) {
  if (baseUrl === API_BASE) return;
  API_BASE = baseUrl;
  apiClient = createApiClient(createClientConfig(API_BASE));
}

/**
 * Backward-compatible ApiError class.
 * Old signature: `new ApiError(status, message)`.
 * New underlying class: `ApiClientError({ status, code, message })`.
 */
class ApiError extends ApiClientError {
  constructor(status: number, message: string) {
    super({ status, code: `HTTP_${status}`, message });
    this.name = "ApiError";
  }
}

// Custom error for aborted requests
export class AbortError extends Error {
  constructor() {
    super("Request was cancelled");
    this.name = "AbortError";
  }
}

async function fetchJson<T>(url: string, options?: RequestInit): Promise<T> {
  try {
    // Determine HTTP method from options
    const method = options?.method?.toUpperCase() ?? "GET";
    const body = options?.body ? JSON.parse(options.body as string) : undefined;
    const fetchOptions: RequestInit = {};
    if (options?.signal) fetchOptions.signal = options.signal;

    switch (method) {
      case "POST":
        return await apiClient.post<T>(url, body, fetchOptions);
      case "PUT":
        return await apiClient.put<T>(url, body, fetchOptions);
      case "DELETE":
        return await apiClient.delete<T>(url, fetchOptions);
      case "PATCH":
        // PATCH falls through to direct fetch since ApiClient doesn't expose patch
        return await fetchJsonDirect<T>(url, options);
      default:
        return await apiClient.get<T>(url, fetchOptions);
    }
  } catch (err) {
    // Re-throw abort errors with our custom type
    if (err instanceof Error && err.name === "AbortError") {
      throw new AbortError();
    }
    // Wrap ApiClientError as ApiError for backward compatibility
    if (err instanceof ApiClientError && !(err instanceof ApiError)) {
      throw new ApiError(err.status, err.message);
    }
    throw err;
  }
}

/** Direct fetch fallback for methods not in ApiClient (e.g. PATCH) */
async function fetchJsonDirect<T>(url: string, options?: RequestInit): Promise<T> {
  const response = await fetch(`${API_BASE}${url}`, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json",
      ...options?.headers,
    },
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({ detail: "Unknown error" }));
    throw new ApiClientError({
      status: response.status,
      code: `HTTP_${response.status}`,
      message: error.detail || `HTTP ${response.status}`,
    });
  }

  if (response.status === 204) {
    return undefined as T;
  }

  return response.json();
}

// Health
export async function getHealth(): Promise<HealthResponse> {
  return fetchJson<HealthResponse>("/health");
}

// Services
export async function getServices(): Promise<{
  services: Service[];
  count: number;
}> {
  return fetchJson("/services");
}

export async function getServiceDimensions(serviceName: string): Promise<ServiceDimensionsResponse> {
  return fetchJson(`/services/${serviceName}/dimensions`);
}

export async function discoverConfigs(serviceName: string, cloudPath: string): Promise<DiscoverConfigsResponse> {
  const params = new URLSearchParams();
  params.set("cloud_path", cloudPath);
  return fetchJson(`/services/${serviceName}/discover-configs?${params.toString()}`);
}

export interface ListDirectoriesResponse {
  service: string;
  cloud_path: string;
  directories: string[];
  count: number;
}

export async function listDirectories(serviceName: string, cloudPath: string): Promise<ListDirectoriesResponse> {
  const params = new URLSearchParams();
  params.set("cloud_path", cloudPath);
  return fetchJson(`/services/${serviceName}/list-directories?${params.toString()}`);
}

export interface ConfigBucketsResponse {
  service: string;
  default_bucket: string | null;
  buckets: Array<{ name: string; path: string }>;
  message?: string;
}

export async function getConfigBuckets(serviceName: string): Promise<ConfigBucketsResponse> {
  return fetchJson(`/services/${serviceName}/config-buckets`);
}

// Config
export async function getVenues(): Promise<VenuesResponse> {
  const raw = await fetchJson<unknown>("/config/venues");
  if (raw && typeof raw === "object" && !Array.isArray(raw)) {
    const r = raw as Record<string, unknown>;
    if ("categories" in r && !("asset_groups" in r)) {
      const { categories, ...rest } = r;
      return { ...rest, asset_groups: categories ?? {} } as VenuesResponse;
    }
  }
  return raw as VenuesResponse;
}

export async function getVenuesByAssetGroup(assetGroup: string): Promise<AssetGroupVenuesResponse> {
  return fetchJson(`/config/venues/${assetGroup}`);
}

export async function getStartDates(serviceName: string): Promise<StartDatesResponse> {
  const raw = await fetchJson<
    StartDatesResponse & {
      start_dates?: Record<string, AssetGroupStartDates & { category_start?: string }>;
    }
  >(`/config/expected-start-dates/${serviceName}`);
  if (!raw.start_dates) return raw;
  const next: StartDatesResponse["start_dates"] = {};
  for (const [ag, block] of Object.entries(raw.start_dates)) {
    if (!block || typeof block !== "object") continue;
    const b = block as AssetGroupStartDates & { category_start?: string };
    const ags = b.asset_group_start ?? b.category_start;
    next[ag] = {
      ...b,
      asset_group_start: typeof ags === "string" ? ags : String(ags ?? ""),
    };
  }
  return { ...raw, start_dates: next };
}

export async function getDependencies(serviceName: string): Promise<DependenciesResponse> {
  return fetchJson(`/config/dependencies/${serviceName}`);
}

// Deployments
export async function getDeployments(filters?: {
  service?: string;
  status?: string;
  asset_group?: string;
  limit?: number;
  forceRefresh?: boolean;
}): Promise<{ deployments: Deployment[]; count: number }> {
  const params = new URLSearchParams();
  if (filters?.service) params.set("service", filters.service);
  if (filters?.status) params.set("status", filters.status);
  if (filters?.asset_group) params.set("asset_group", filters.asset_group);
  if (filters?.limit) params.set("limit", filters.limit.toString());
  if (filters?.forceRefresh) params.set("force_refresh", "true");

  const query = params.toString();
  return fetchJson(`/deployments${query ? `?${query}` : ""}`);
}

export async function getDeployment(id: string): Promise<Deployment> {
  return fetchJson(`/deployments/${id}`);
}

export async function createDeployment(request: DeploymentRequest): Promise<CreateDeploymentResponse> {
  return fetchJson("/deployments", {
    method: "POST",
    body: JSON.stringify(request),
  });
}

export interface QuotaInfoResponse {
  service: string;
  compute: string;
  region: string;
  date_range?: { start: string; end: string };
  total_shards: number;
  effective_settings: {
    max_concurrent: number;
    date_granularity?: string | null;
    skip_dimensions?: string[];
  };
  required_quota: Record<string, unknown>;
  live_quota?: Record<string, unknown> | null;
  live_quota_error?: string | null;
  recommended_max_concurrent?: number | null;
}

export async function getDeploymentQuotaInfo(request: DeploymentRequest): Promise<QuotaInfoResponse> {
  return fetchJson("/deployments/quota-info", {
    method: "POST",
    body: JSON.stringify(request),
  });
}

// Deployment Actions
export interface CancelDeploymentResult {
  deployment_id: string;
  status: string;
  cancelled_shards: number;
  message: string;
}

export async function cancelDeployment(id: string): Promise<CancelDeploymentResult> {
  return fetchJson(`/deployments/${id}/cancel`, { method: "POST" });
}

export interface ResumeDeploymentResult {
  deployment_id: string;
  status: string;
  total_shards: number;
  completed: number;
  failed: number;
  message: string;
}

export async function resumeDeployment(id: string): Promise<ResumeDeploymentResult> {
  return fetchJson(`/deployments/${id}/resume`, { method: "POST" });
}

// VM operator controls — POST /api/vm/admin/{vm}/(pause|resume|cancel) → AdminActionResult (202).
// Pause writes a cooperative pause-signal blob; resume deletes it; cancel marks the deployment
// terminal (→ archive). Protective (pause/stop) are safe-by-default; the UI confirms on stop.
export interface VmAdminActionResult {
  action: string;
  status: string;
  message: string;
}

export async function pauseVm(vmName: string): Promise<VmAdminActionResult> {
  return fetchJson(`/vm/admin/${encodeURIComponent(vmName)}/pause`, { method: "POST" });
}

export async function resumeVm(vmName: string): Promise<VmAdminActionResult> {
  return fetchJson(`/vm/admin/${encodeURIComponent(vmName)}/resume`, { method: "POST" });
}

export async function cancelVm(vmName: string): Promise<VmAdminActionResult> {
  return fetchJson(`/vm/admin/${encodeURIComponent(vmName)}/cancel`, { method: "POST" });
}

export interface VerifyCompletionResult {
  completed_with_errors: number;
  completed_with_warnings: number;
  completed_with_verification: number;
  completed: number;
}

export async function verifyDeploymentCompletion(
  id: string,
  options?: { force?: boolean },
): Promise<VerifyCompletionResult> {
  const params = new URLSearchParams();
  if (options?.force) params.set("force", "true");
  const query = params.toString();
  return fetchJson(`/deployments/${id}/verify-completion${query ? `?${query}` : ""}`, { method: "POST" });
}

export interface RetryFailedResult {
  deployment_id: string;
  status?: string;
  shards_to_retry?: number;
  shards_retried?: number;
  dry_run?: boolean;
  message: string;
  shards?: Array<{
    shard_id: string;
    dimensions: Record<string, unknown>;
    error_message?: string;
    retries: number;
  }>;
}

export async function retryFailedShards(
  id: string,
  options?: { asset_group?: string; dryRun?: boolean },
): Promise<RetryFailedResult> {
  const params = new URLSearchParams();
  if (options?.asset_group) params.set("asset_group", options.asset_group);
  if (options?.dryRun) params.set("dry_run", "true");
  const query = params.toString();

  // Retry can take 30-60 seconds as it creates VMs — use a dedicated client with 2-minute timeout
  const retryClient = createApiClient(createClientConfig(API_BASE, { timeoutMs: 120_000 }));
  return retryClient.post<RetryFailedResult>(`/deployments/${id}/retry-failed${query ? `?${query}` : ""}`);
}

// Single Shard Actions
export interface CancelShardResult {
  deployment_id: string;
  shard_id: string;
  status: string;
  message: string;
}

export async function cancelShard(deploymentId: string, shardId: string): Promise<CancelShardResult> {
  return fetchJson(`/deployments/${deploymentId}/shards/${shardId}/cancel`, {
    method: "POST",
  });
}

// Update deployment metadata (tag)
export interface UpdateDeploymentResult {
  deployment_id: string;
  tag: string | null;
  message: string;
}

export async function updateDeploymentTag(id: string, tag: string | null): Promise<UpdateDeploymentResult> {
  return fetchJson(`/deployments/${id}`, {
    method: "PATCH",
    body: JSON.stringify({ tag }),
  });
}

export async function deleteDeployment(
  id: string,
): Promise<{ deployment_id: string; deleted: boolean; message: string }> {
  return fetchJson(`/deployments/${id}`, { method: "DELETE" });
}

export interface BulkDeleteResult {
  total_requested: number;
  deleted: number;
  failed: number;
  results: Array<{
    deployment_id: string;
    deleted: boolean;
    error?: string;
    message?: string;
  }>;
}

export async function bulkDeleteDeployments(deploymentIds: string[]): Promise<BulkDeleteResult> {
  return fetchJson("/deployments/bulk-delete", {
    method: "POST",
    body: JSON.stringify({ deployment_ids: deploymentIds }),
  });
}

// Infrastructure Reporting
export interface DeploymentReport {
  deployment_id: string;
  service: string;
  compute_type: string;
  status: string;
  summary: {
    total_shards: number;
    succeeded: number;
    failed: number;
    total_retries: number;
    success_rate: number;
  };
  failure_breakdown: Record<string, number>;
  zone_usage: Record<string, number>;
  region_usage: Record<string, number>;
  failed_shards: Array<{
    shard_id: string;
    error?: string;
    asset_group?: string;
    dimensions?: Record<string, unknown>;
  }>;
  infrastructure_issues: Array<{
    shard_id: string;
    zone?: string;
    region?: string;
    reason?: string;
    asset_group?: string;
    attempt?: number;
  }>;
  retry_stats: {
    shards_with_retries: number;
    total_zone_switches: number;
    total_region_switches: number;
  };
}

export async function getDeploymentReport(id: string): Promise<DeploymentReport> {
  return fetchJson(`/deployments/${id}/report`);
}

export interface RerunCommands {
  deployment_id: string;
  service: string;
  compute_type: string;
  total_commands: number;
  commands: Array<{
    shard_id: string;
    status: string;
    error?: string;
    command: string;
    dimensions?: Record<string, unknown>;
  }>;
  combined_retry_command?: string;
}

export async function getRerunCommands(
  id: string,
  options?: { failedOnly?: boolean; shardId?: string },
): Promise<RerunCommands> {
  const params = new URLSearchParams();
  if (options?.failedOnly) params.set("failed_only", "true");
  if (options?.shardId) params.set("shard_id", options.shardId);
  const query = params.toString();
  return fetchJson(`/deployments/${id}/rerun-commands${query ? `?${query}` : ""}`);
}

// Checklists
export async function getChecklist(serviceName: string): Promise<ChecklistResponse> {
  return fetchJson(`/checklists/${serviceName}/checklist`);
}

export async function validateChecklist(serviceName: string): Promise<ChecklistValidateResponse> {
  return fetchJson(`/checklists/${serviceName}/checklist/validate`);
}

export async function listChecklists(): Promise<{
  checklists: ChecklistSummary[];
  count: number;
}> {
  return fetchJson("/checklists");
}

// Epics
export async function getEpics(): Promise<EpicSummary[]> {
  return fetchJson("/epics");
}

export async function getEpicDetail(epicId: string): Promise<EpicDetail> {
  return fetchJson(`/epics/${epicId}`);
}

// --- Epics tab v2 — live PM epics + active-plan drilldown (operator add 2026-06-10) ----

export interface EpicPlanRow {
  slug: string;
  parent_epic: string;
  status: string;
  estimate_class: string;
  done: number;
  open: number;
  open_p0p1: number;
  pct: number;
  github_url: string;
}

export interface EpicCard {
  name: string;
  /** Filename slug (e.g. mtds_mdps_master) — the canonical match key vs plan.parent_epic. */
  slug: string;
  title: string;
  tier: string;
  priority: string;
  assigned_vm: string;
  status: string;
  github_url: string;
  plans: EpicPlanRow[];
  plan_count: number;
  done_total: number;
  open_total: number;
}

export interface EpicsPlansResponse {
  generated_at: string;
  source: string;
  /** True = GitHub unreachable/rate-limited; payload is the API's last cached snapshot. */
  stale?: boolean;
  epics: EpicCard[];
  orphans: EpicPlanRow[];
  orphan_count: number;
}

export async function getEpicsPlans(): Promise<EpicsPlansResponse> {
  return fetchJson<EpicsPlansResponse>("/epics/plans");
}

// Data Status
export async function getDataStatus(params: {
  service: string;
  start_date: string;
  end_date: string;
  mode?: string;
  asset_group?: string[];
  venue?: string[];
  show_missing?: boolean;
  check_venues?: boolean;
  check_data_types?: boolean;
  force_refresh?: boolean;
}): Promise<DataStatusResponse | VenueCheckResponse | DataTypeCheckResponse> {
  const searchParams = new URLSearchParams();
  searchParams.set("service", params.service);
  searchParams.set("start_date", params.start_date);
  searchParams.set("end_date", params.end_date);
  if (params.mode) {
    searchParams.set("mode", params.mode);
  }
  if (params.asset_group) {
    params.asset_group.forEach((c) => searchParams.append("asset_group", c));
  }
  if (params.venue) {
    params.venue.forEach((v) => searchParams.append("venue", v));
  }
  if (params.show_missing) {
    searchParams.set("show_missing", "true");
  }
  if (params.check_venues) {
    searchParams.set("check_venues", "true");
  }
  if (params.check_data_types) {
    searchParams.set("check_data_types", "true");
  }
  if (params.force_refresh) {
    searchParams.set("force_refresh", "true");
  }
  const raw = await fetchJson<DataStatusResponse | VenueCheckResponse | DataTypeCheckResponse>(
    `/data-status?${searchParams.toString()}`,
  );
  // Legacy data-status CLI JSON used `categories`; deployment-api and current
  // CLIs emit `asset_groups`. Accept both for one release. Use
  // ``overall_excluded`` to disambiguate from ``DataTypeCheckResponse`` (which
  // also has ``overall_completion`` but no per-asset-group block).
  if (raw && typeof raw === "object" && "overall_excluded" in raw && "categories" in raw && !("asset_groups" in raw)) {
    const legacy = raw as DataStatusResponse & {
      categories: DataStatusResponse["asset_groups"];
    };
    const { categories, ...rest } = legacy;
    return { ...rest, asset_groups: categories } as DataStatusResponse;
  }
  return raw;
}

// ===========================================================================
// Hierarchical shard-atom drill-down — drilldown plan Phase 1/2.
// ===========================================================================

/** One node in the per-(service, asset_group) hierarchical drill-down tree.
 *
 * Returned by ``GET /api/data-status/drilldown/{service}/{asset_group}``.
 * Mirrors ``DrilldownNode.to_dict()`` in
 * ``deployment_api/services/data_status_hierarchical.py``.
 */
/** Per-(pipeline_mode, source) capture_status CELL counts for one cell/node.
 *
 * G3/M5 v9 manifest UNION drilldown: a single logical cell carries one
 * manifest row per (source x pipeline_mode); this row reports how each
 * provenance combination answered the cell, so the UI can show "captured via
 * batch_databento + replay_databento, missing in live_databento". Mirrors
 * ``provenance_breakdown()`` in ``deployment_api/services/data_status_union.py``.
 */
export interface DrilldownProvenance {
  pipeline_mode: string;
  source: string;
  transport: string;
  /** M8 observability axis — operational cadence / deployment topology
   * (one_off_backfill / t1_daily / scheduled_recurring / continuous_live /
   * recovery_replay). ORTHOGONAL to pipeline_mode; threaded through the
   * deployment-api data-status union like ``transport``. Blank on manifests
   * predating the cadence column. */
  cadence?: string;
  captured: number;
  empty_confirmed: number;
  attempted_failed: number;
  expected_unattempted: number;
}

export interface DrilldownNode {
  axis: string;
  value: string;
  captured: number;
  empty_confirmed: number;
  attempted_failed: number;
  expected_unattempted: number;
  total: number;
  completion_pct: number;
  row_key: Record<string, string>;
  /** G3/M5: per-(pipeline_mode, source) breakdown, populated at shard-atom
   * leaves only (empty on non-leaf nodes and on v8 manifests). */
  provenance?: DrilldownProvenance[];
  children: DrilldownNode[];
  is_leaf: boolean;
}

export interface DrilldownTotals {
  captured: number;
  empty_confirmed: number;
  attempted_failed: number;
  expected_unattempted: number;
  total: number;
  completion_pct: number;
}

export interface DrilldownResponse {
  service: string;
  asset_group: string;
  axes: string[];
  tree: DrilldownNode[];
  totals: DrilldownTotals;
  filtered_by: Record<string, string>;
  manifest_uri?: string;
  mock?: boolean;
  /** Pagination — Phase 6 of
   * data_status_drilldown_shard_atom_alignment_2026_05_07.plan.
   * ``total_top_axis_children`` is the unfiltered child count at the
   * head axis; ``child_offset`` / ``child_limit`` echo the page
   * requested. UI uses them to render "showing N–M of T" + load-more.
   */
  total_top_axis_children?: number;
  child_offset?: number;
  child_limit?: number | null;
  /** G3/M5: top-level per-(pipeline_mode, source) breakdown across the whole
   * filtered slice (cell-grain union). Empty on v8 manifests. */
  provenance?: DrilldownProvenance[];
}

export interface DrilldownPair {
  service: string;
  asset_group: string;
  axes: string[];
}

const _DRILLDOWN_FILTER_KEYS: readonly string[] = [
  "chain",
  "venue",
  "data_type",
  "instrument_type",
  "instrument_id",
  "league_id",
  "feature_group",
  "timeframe",
  "canonical_question_group",
  // G3/M5 v9 provenance filter axes.
  "pipeline_mode",
  "source",
] as const;

export async function getHierarchicalDrilldown(params: {
  service: string;
  asset_group: string;
  start_date: string;
  end_date: string;
  filters?: Record<string, string>;
  expand_to_depth?: number;
  /** Pagination offset into the top-level children list (Phase 6). */
  child_offset?: number;
  /** Max top-level children returned. ``undefined`` = no slice. */
  child_limit?: number;
  /** G3/M5 provenance group-by axes (``pipeline_mode`` / ``source``) inserted
   * at the top of the tree to compare batch-vs-live / per-source coverage. */
  group_by?: string[];
  signal?: AbortSignal;
}): Promise<DrilldownResponse> {
  const sp = new URLSearchParams();
  sp.set("start_date", params.start_date);
  sp.set("end_date", params.end_date);
  if (params.expand_to_depth != null) {
    sp.set("expand_to_depth", String(params.expand_to_depth));
  }
  if (params.child_offset != null) {
    sp.set("child_offset", String(params.child_offset));
  }
  if (params.child_limit != null) {
    sp.set("child_limit", String(params.child_limit));
  }
  for (const groupAxis of params.group_by ?? []) {
    sp.append("group_by", groupAxis);
  }
  for (const key of _DRILLDOWN_FILTER_KEYS) {
    const val = params.filters?.[key];
    if (val != null && val !== "") {
      sp.set(key, val);
    }
  }
  return fetchJson<DrilldownResponse>(
    `/data-status/drilldown/${encodeURIComponent(params.service)}/${encodeURIComponent(
      params.asset_group,
    )}?${sp.toString()}`,
    { signal: params.signal },
  );
}

export async function getDrilldownSupportedPairs(opts?: { signal?: AbortSignal }): Promise<DrilldownPair[]> {
  const res = await fetchJson<{ pairs: DrilldownPair[] }>(`/data-status/drilldown-pairs`, { signal: opts?.signal });
  return res.pairs ?? [];
}

// ===========================================================================
// Deploy-Missing surgical-recovery preview — drilldown plan Phase 3.
// ===========================================================================

/** Response from ``POST /api/data-status/deploy-missing-preview``. Mirrors
 * the Python ``DeployMissingPreview.to_dict()`` shape. */
export interface DeployMissingPreviewResponse {
  service: string;
  asset_group: string;
  row_key: Record<string, string>;
  shard_key: string;
  launcher_script: string;
  command: string;
  notes: string[];
  mode: DeployMissingMode;
  warnings: string[];
}

/** Launch modes supported by the Deploy-Missing flow.
 *
 * - ``preview`` — bash invocation against the GCS tarball that's
 *   currently in ``deployment-scripts-{pid}``. Operator copies + runs
 *   from their authenticated terminal. Safe in any environment.
 * - ``tarball-from-local`` — pairs the launcher with a
 *   ``create-code-tarballs.sh --all`` step that bundles the operator's
 *   local working tree before the VM launches. **ONLY works from the
 *   operator's workstation** — never from a Cloud Run pod / CI runner.
 *   Strong UI warning required.
 *
 * Future modes (auto-launch) live behind the
 * ``deploy_missing_auto_launch_2026_05_07`` successor plan.
 */
export type DeployMissingMode = "preview" | "tarball-from-local";

export async function postDeployMissingPreview(params: {
  service: string;
  asset_group: string;
  row_key: Record<string, string>;
  mode?: DeployMissingMode;
  signal?: AbortSignal;
}): Promise<DeployMissingPreviewResponse> {
  return fetchJson<DeployMissingPreviewResponse>(`/data-status/deploy-missing-preview`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      service: params.service,
      asset_group: params.asset_group,
      row_key: params.row_key,
      mode: params.mode ?? "preview",
    }),
    signal: params.signal,
  });
}

export async function getDeployMissingServices(opts?: { signal?: AbortSignal }): Promise<string[]> {
  const res = await fetchJson<{ services: string[] }>(`/data-status/deploy-missing-services`, { signal: opts?.signal });
  return res.services ?? [];
}

// ===========================================================================
// Deploy-Missing auto-launch — deploy_missing_auto_launch_2026_05_07 Phase 2.
// ===========================================================================

/** Response from ``POST /api/data-status/deploy-missing-launch``. Mirrors
 * the Python ``DeployMissingLaunchResult.to_dict()`` shape. */
export interface DeployMissingLaunchResult {
  service: string;
  asset_group: string;
  shard_key: string;
  shard_key_hash: string;
  vm_name: string;
  correlation_id: string;
  events_uri: string;
  dry_run: boolean;
  started_confirmed: boolean;
  inflight_vm_name: string | null;
}

export async function postDeployMissingLaunch(params: {
  service: string;
  asset_group: string;
  row_key: Record<string, string>;
  operator_id?: string;
  dry_run?: boolean;
  signal?: AbortSignal;
}): Promise<DeployMissingLaunchResult> {
  return fetchJson<DeployMissingLaunchResult>(`/data-status/deploy-missing-launch`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      service: params.service,
      asset_group: params.asset_group,
      row_key: params.row_key,
      operator_id: params.operator_id ?? "ui-operator",
      dry_run: params.dry_run ?? false,
    }),
    signal: params.signal,
  });
}

/** One sports fixture row from ``GET /fixtures/upcoming`` (deployment-api). */
export interface UpcomingFixture {
  fixture_id: string;
  kickoff_utc: string;
  league_id: string;
  home_team_id: string;
  away_team_id: string;
  home_team_name: string;
  away_team_name: string;
  venue_id: string;
  venue_name: string;
  status: string;
  round: string;
}

export async function fetchUpcomingFixtures(opts?: {
  days?: number;
  league_id?: string;
  signal?: AbortSignal;
}): Promise<UpcomingFixture[]> {
  const searchParams = new URLSearchParams();
  if (opts?.days != null) {
    searchParams.set("days", String(opts.days));
  }
  if (opts?.league_id) {
    searchParams.set("league_id", opts.league_id);
  }
  const q = searchParams.toString();
  const path = `/fixtures/upcoming${q ? `?${q}` : ""}`;
  const res = await fetchJson<{ fixtures: UpcomingFixture[]; mock?: boolean }>(path, { signal: opts?.signal });
  return res.fixtures ?? [];
}

// Turbo Data Status - much faster for large services (uses month-prefix queries)

// Data type completion status (nested within venue).
//
// Shape mirrors what `_build_data_type_breakdown` returns in deployment-api
// `data_status_service.py`. Includes the Phase-1 four-state classification
// fields (deployment-api commit c73c732, 2026-04-28):
//
//   - missing       — actionable: in EXPECTED_COVERAGE scope, raw is captured
//                     (or this IS raw), processed shard absent. `missing_dates`
//                     contains only the actionable subset.
//   - blocked_on_raw — non-actionable: processed shard absent because raw is
//                     also absent. `blocked_on_raw_dates` lists those dates.
//                     UI should render amber, not red.
//   - out_of_scope  — `(asset_group, venue, data_type)` not in
//                     EXPECTED_COVERAGE_BY_ASSET_GROUP. Excluded from
//                     denominator at UI; render gray or hide by default.
//   - captured      — `dates_found` covers this state.
//
// Empty fields (`blocked_on_raw_dates: []`, `out_of_scope: false`) are the
// implicit defaults when the deployment-api response predates the four-state
// rollout — UI should treat absence the same as `false` / `[]`.
export interface TurboDataTypeStatus {
  dates_found: number;
  dates_expected: number;
  dates_missing?: number;
  dates_blocked_on_raw?: number;
  dates_found_list?: string[];
  missing_dates?: string[];
  blocked_on_raw_dates?: string[];
  completion_pct: number;
  start_date?: string | null;
  is_expected?: boolean;
  in_expected_coverage?: boolean;
  is_processed_data_type?: boolean;
  out_of_scope?: boolean;
  status?: "complete" | "partial" | "missing";
}

export interface TurboLeagueStatus {
  // Legacy v3/v4 fields (kept for forward/back-compat; may be absent on v5 responses).
  dates_found?: number;
  dates_expected?: number;
  dates_missing?: number;
  dates_found_list?: string[];
  // v5 honest-coverage canonical fields (per codex/02-data/availability-manifest-and-data-status.md).
  // SPORTS per-league entries emit these; the UI prefers them when present.
  found_shards?: number;
  expected_shards?: number;
  missing_shards?: number;
  found_dates_list?: string[];
  missing_dates?: string[];
  missing_count?: number; // Total missing count (list may be a truncated sample)
  completion_pct: number;
  unit?: string;
  not_applicable?: boolean;
}

export interface TurboSubDimension {
  dates_found: number;
  dates_expected: number; // Legacy: asset-group-level expected
  dates_missing?: number;
  missing_dates?: string[];
  dates_expected_venue?: number; // NEW: venue-specific expected based on venue start
  dates_expected_asset_group?: number; // NEW: asset-group-level expected for reference
  venue_start_date?: string | null; // NEW: when venue data starts
  completion_pct: number;
  is_expected?: boolean;
  status?: "expected" | "bonus";
  // Dimension-weighted values (accounts for multiple expected data_types/folders per venue)
  _dim_weighted_found?: number;
  _dim_weighted_expected?: number;
  dates_found_count?: number; // Total found count
  dates_found_list?: string[]; // First 25 found dates (or all if <= 50)
  dates_found_list_tail?: string[]; // Last 25 found dates (if truncated)
  dates_found_truncated?: boolean; // True if found list was truncated
  dates_missing_count?: number; // Total missing count
  dates_missing_list?: string[]; // First 25 missing dates (or all if <= 50)
  dates_missing_list_tail?: string[]; // Last 25 missing dates (if truncated)
  dates_missing_truncated?: boolean; // True if list was truncated
  data_types?: Record<string, TurboDataTypeStatus>; // NEW: per-data-type breakdown
  // Post-v9 PREDICTION bundled-atom cluster drilldown. Keyed by
  // market_id (conditionId), value = row count within the cqg bundle.
  // Populated on `data_types` entries when `breakdown_axis === "canonical_question_group"`.
  observed_clusters?: Record<string, number>;
  instrument_types?: Record<string, TurboInstrumentTypeStatus>; // v4: per-instrument-type (spot, perpetuals, etc.)
  leagues?: Record<string, TurboLeagueStatus>; // Per-league breakdown (SPORTS/PREDICTION)
  // Canonical shard totals (populated for SPORTS data_type entries from the
  // honest-coverage availability manifest). Consumers should prefer these
  // over `dates_found` / `dates_expected` / `dates_missing` when present.
  found_shards?: number;
  expected_shards?: number;
  missing_shards?: number;
  unit?: string; // e.g. "fixture_dates", "daily_snapshots"
  axis?: string; // e.g. "per_league_per_fixture_date", "global_periodic"
  source?: string; // e.g. "api_football"
  expected_leagues?: string[];
  // MTDS honest-coverage annotations (2026-04-20 / deployment-api Phase 6c /
  // deployment-api commit 9d21ac8). Populated on MTDS venue rows inside
  // CEFI / TRADFI / DEFI / PREDICTION categories only — SPORTS keeps the
  // data-type-axis drilldown under the category entry itself. Absent for
  // non-MTDS services (instruments-service / MDPS / features-* / …).
  expected_data_types?: string[]; // UAC-declared data_types for this venue
  missing_data_types?: string[]; // declared data_types with zero found shards
  honest_data_types?: Record<string, TurboHonestDataTypeStatus>; // per-dt honest-coverage drilldown
  honest_axis?: string; // e.g. "per_venue_per_data_type_per_day"
  // Honest-coverage rollups emitted by deployment-api per venue
  // (writegate Phase 4.A — deployment-api@453836d / @7d57056).
  // ``failure_pillars`` buckets ``attempted_failed`` rows by typed-error
  // class prefix (UpstreamTimestampBiasError / MalformedTickFieldError /
  // ClusterCoverageError / LookaheadBiasError + placeholder pillars +
  // ``failed_other`` catch-all). ``empty_reasons`` buckets ``empty_confirmed``
  // rows by ``error_reason`` per the closed UAC ``EMPTY_CONFIRMED_REASONS``
  // taxonomy plus an ``empty_unclassified`` catch-all that doubles as a
  // back-fill progress indicator. Both maps surface every registered key
  // with count 0 when no rows match, so the UI can render a fixed grid
  // without conditional checks. SSOT: deployment_api/services/data_status_service.py
  // ``_FAILURE_PILLAR_KEYS`` + ``_EMPTY_REASON_KEYS``.
  failure_pillars?: Record<string, number>;
  empty_reasons?: Record<string, number>;
  // Capture-status rollup — Phase-C honest-coverage venue-level split.
  capture_status_counts?: {
    captured: number;
    empty_confirmed: number;
    attempted_failed: number;
    // Phase 4 P1: all 5 fields exposed (expected_unattempted split)
    expected_unattempted_known_empty?: number;
    expected_unattempted_pending_fetch?: number;
    // OOW bucket: never-collectable cells excluded from denominator (pre-genesis / delisted / etc.)
    out_of_window?: number;
  };
  // Phase 4 P1: canonical alias for capture_status_counts (all 5 fields always present)
  counts?: {
    captured: number;
    empty_confirmed: number;
    attempted_failed: number;
    expected_unattempted_known_empty: number;
    expected_unattempted_pending_fetch: number;
    // OOW bucket: never-collectable cells excluded from denominator (pre-genesis / delisted / etc.)
    out_of_window?: number;
  };
  // Phase 4 P1: honest_coverage float (0–1) pre-computed by API; never re-derive client-side
  coverage?: number;
  attempt_coverage_pct?: number;
  capture_coverage_pct?: number;
  empty_rate?: number;
  failure_rate?: number;
}

/**
 * Per-data-type honest-coverage stats emitted under
 * `TurboSubDimension.honest_data_types` for MTDS venues
 * (deployment-api commit 9d21ac8). Shards are
 * `(venue, data_type, date)` triples over the UAC-declared date window for
 * this (venue, data_type); missing shards isolate real adapter gaps from
 * venue-wide day misses.
 *
 * Phase 8 extensions (deployment-api commit c059e6f, 2026-04-20): adds per-
 * instrument shard-unit discrimination. `unit` now signals whether the
 * denominator is venue-level (`shard_days`), per-instrument
 * (`shard_instrument_days`, Tier-3 dt such as trades/book_snapshot_5), or
 * the degraded pre-Phase-8C fallback (`shard_days_legacy`). When
 * per-instrument, `expected_instruments` / `missing_instruments` / optional
 * `per_instrument` detail the instrument universe behind the shard count.
 */
export interface TurboHonestDataTypeStatus {
  expected_shards: number;
  found_shards: number;
  missing_shards: number;
  completion_pct: number;
  unit?: "shard_days" | "shard_instrument_days" | "shard_days_legacy" | string;
  missing_dates?: string[];
  dates_found_list?: string[];
  axis?: string; // Phase 6c: e.g. "per_venue_per_data_type_per_day"
  // Phase 8 per-instrument shard fields
  expected_instruments?: string[]; // instrument_ids in the denominator
  missing_instruments?: string[]; // instruments with zero captured shards
  per_instrument?: Record<string, TurboHonestInstrumentStatus>; // populated when instrument universe < 20
  legacy_row_count?: number; // count of pre-Phase-8C rows counted via Tier-2 fallback
}

/**
 * Per-instrument honest-coverage stats inside
 * `TurboHonestDataTypeStatus.per_instrument`. Only emitted when the
 * (venue, data_type) instrument universe is small enough (< 20) to keep
 * the aggregator response compact.
 */
export interface TurboHonestInstrumentStatus {
  found_shards: number;
  expected_shards: number;
  completion_pct: number;
  missing_dates?: string[];
}

export interface TurboUnderlyingStatus {
  dates_found: number;
  dates_expected: number;
  completion_pct: number;
  data_types?: Record<string, TurboDataTypeStatus>;
}

export interface TurboInstrumentTypeStatus {
  dates_found: number;
  dates_expected: number;
  completion_pct: number;
  data_types?: Record<string, TurboDataTypeStatus>;
  underlyings?: Record<string, TurboUnderlyingStatus>;
}

export interface TurboChainStatus {
  dates_found: number;
  dates_expected: number;
  completion_pct: number;
  venues: string[];
  venue_count: number;
  shards_found?: number;
  shards_expected?: number;
}

// Closed-set enum mirroring UAC `FeatureFamily` (Phase 1A of
// features_repo_consolidation_2026_05_08.plan). Each value corresponds
// to one ``features-{family}-service`` repo. The 8 values are the
// SSOT — adding a new family is a deliberate UAC change paired with
// this type. Source:
// unified_api_contracts/canonical/domain/features/registry.py.
export type FeatureFamily =
  | "calendar"
  | "commodity"
  | "cross_instrument"
  | "delta_one"
  | "multi_timeframe"
  | "onchain"
  | "sports"
  | "volatility";

export const FEATURE_FAMILIES: ReadonlyArray<FeatureFamily> = [
  "calendar",
  "commodity",
  "cross_instrument",
  "delta_one",
  "multi_timeframe",
  "onchain",
  "sports",
  "volatility",
];

export function isFeatureFamily(value: string): value is FeatureFamily {
  return (FEATURE_FAMILIES as readonly string[]).includes(value);
}

export interface TurboFeatureGroupStatus {
  dates_found: number;
  dates_expected: number;
  completion_pct: number;
  timeframes?: Record<string, { dates_found: number; dates_expected: number; completion_pct: number }>;
  // Optional feature_family axis (Phase 8B of features_repo_consolidation_
  // 2026_05_08.plan). When the manifest row carries a non-null
  // feature_family value the deployment-api propagates it here so the UI
  // can group feature_groups by family. Null / absent on non-features
  // rows (MTDS / MDPS) or pre-Phase-8B manifest rows.
  feature_family?: FeatureFamily | null;
}

// Phase 8B feature_family rollup (Phase 8B of
// features_repo_consolidation_2026_05_08.plan). The deployment-api
// populates this when ``feature_groups`` rows carry a populated
// ``feature_family``; the UI drills feature_family -> feature_group ->
// timeframe. Backwards-compatible: a feature_groups response without
// any feature_family rows simply has no `feature_families` map and the
// UI falls back to the flat feature_groups view.
export interface TurboFeatureFamilyStatus {
  dates_found: number;
  dates_expected: number;
  completion_pct: number;
  feature_groups: Record<string, TurboFeatureGroupStatus>;
}

export interface TurboVenueSummary {
  expected_venues: string[];
  found_venues: string[];
  expected_but_missing: string[];
  unexpected_but_found: string[];
  expected_count: number;
  found_count: number;
  expected_coverage_pct: number;
}

export interface TurboAssetGroupStatus {
  asset_group: string;
  bucket: string;
  prefixes_queried: number;
  dates_expected: number;
  dates_found: number;
  dates_missing: number;
  completion_pct: number;
  // Axis discriminator added 2026-04-20. Controls whether the sub-dimension
  // drilldown lives under `venues` ("venue", legacy default used by CEFI /
  // TRADFI / DEFI) or under `data_types` ("data_type", used by SPORTS or, for
  // post-v9 PREDICTION, "canonical_question_group" keyed by cqg group name).
  // Consumers MUST branch on this when reading sub-dimensions.
  breakdown_axis?: "venue" | "data_type" | "canonical_question_group";
  // Coverage semantics (2026-04-19): distinguishes "dense" categories where
  // every underlying is expected to produce data every day (CeFi / TradFi /
  // DeFi) from "event_driven" categories where underlyings only trade on a
  // fraction of days (sports fixtures, Polymarket conditionIds). For
  // event_driven categories `completion_pct` is aliased to `attempt_coverage_pct`
  // so the row header reflects "did we observe every market?" rather than
  // the misleading "is every market dense every day?".
  coverage_semantics?: "dense" | "event_driven";
  attempt_coverage_pct?: number;
  capture_coverage_pct?: number;
  empty_rate_estimate?: number | null;
  failure_rate?: number;
  // Phase 4 P1: category-level capture-status counts + honest-coverage float
  capture_status_counts?: {
    captured: number;
    empty_confirmed: number;
    attempted_failed: number;
    expected_unattempted_known_empty?: number;
    expected_unattempted_pending_fetch?: number;
    // OOW bucket: never-collectable cells excluded from denominator (pre-genesis / delisted / etc.)
    out_of_window?: number;
  };
  counts?: {
    captured: number;
    empty_confirmed: number;
    attempted_failed: number;
    expected_unattempted_known_empty: number;
    expected_unattempted_pending_fetch: number;
    // OOW bucket: never-collectable cells excluded from denominator (pre-genesis / delisted / etc.)
    out_of_window?: number;
  };
  // honest_coverage float (0–1); use instead of recomputing from counts client-side
  coverage?: number;
  missing_dates: string[] | string;
  // Category-level dates lists (with truncation for UI display)
  dates_found_count?: number; // Total found count
  dates_found_list?: string[]; // First 25 found dates (or all if <= 50)
  dates_found_list_tail?: string[]; // Last 25 found dates (if truncated)
  dates_found_truncated?: boolean; // True if found list was truncated
  dates_missing_count?: number; // Total missing count
  dates_missing_list?: string[]; // First 25 missing dates (or all if <= 50)
  dates_missing_list_tail?: string[]; // Last 25 missing dates (if truncated)
  dates_missing_truncated?: boolean; // True if missing list was truncated
  // Per-date venue completeness (for instruments-service deploy missing)
  dates_fully_complete_list?: string[]; // Dates where ALL expected venues have data
  dates_partially_complete_list?: string[]; // Dates where SOME expected venues have data
  dates_fully_complete_count?: number;
  dates_partially_complete_count?: number;
  error?: string;
  bulk_service?: boolean; // True if this category is served by a bulk download service
  // Dimension-weighted category totals (accounts for data_types/folders per venue)
  venue_weighted?: boolean;
  venue_dates_found?: number;
  venue_dates_expected?: number;
  overall_shards_found?: number;
  overall_shards_expected?: number;
  /**
   * Shards-weighted could-exist ratio for this asset group category.
   * The operator-canonical metric exposed via /manifest drilldown.
   */
  completion_pct_shards_weighted?: number;
  /** Date-axis could-exist coverage. */
  completion_pct_dates?: number;
  /** Blended attempt-weighted could-exist coverage. */
  completion_pct_attempt_blended?: number;
  // Sub-dimensions (venue, data_type, feature_group, folder depending on service)
  venues?: { [name: string]: TurboSubDimension };
  data_types?: { [name: string]: TurboSubDimension };
  folders?: { [name: string]: TurboSubDimension }; // Instrument type breakdown
  chains?: { [name: string]: TurboChainStatus }; // DeFi chain breakdown (v4)
  feature_groups?: { [name: string]: TurboFeatureGroupStatus }; // Feature service breakdown (v4)
  // Phase 8B feature-family rollup. When present, UI prefers this for the
  // features-service drilldown (feature_family -> feature_group -> timeframe);
  // when absent, the flat feature_groups map renders unchanged.
  feature_families?: { [family: string]: TurboFeatureFamilyStatus };
  venue_summary?: TurboVenueSummary;
}

export interface TurboDataStatusResponse {
  service: string;
  date_range: {
    start: string;
    end: string;
    days: number;
  };
  mode: "turbo";
  first_day_of_month_only?: boolean; // True if only checking first day of each month (TARDIS free tier)
  sub_dimension?: string | null; // 'venue' | 'data_type' | 'feature_group' | 'feature_family' | null
  overall_completion_pct: number;
  // Explicit capture-vs-attempt split (R7, 2026-06-15) — the headline shows these
  // labeled instead of the ambiguous `overall_completion_pct`. capture = captured /
  // could-exist; attempt = (captured + empty_confirmed + failed) / could-exist (empty
  // confirmations count as covered). Optional until the backend field deploys.
  overall_capture_coverage_pct?: number;
  overall_attempt_coverage_pct?: number;
  overall_dates_found: number; // venue-weighted total
  overall_dates_expected: number; // venue-weighted expected
  // Category-level totals for reference (not venue-weighted)
  overall_dates_found_asset_group?: number;
  overall_dates_expected_asset_group?: number;
  overall_shards_found?: number;
  overall_shards_expected?: number;
  total_missing?: number;
  unexpected_missing?: number;
  expected_missing?: number;
  asset_groups: {
    [asset_group: string]: TurboAssetGroupStatus;
  };
}

export async function getDataStatusTurbo(params: {
  service: string;
  start_date: string;
  end_date: string;
  mode?: "batch" | "live"; // batch vs live GCS paths
  asset_group?: string[];
  venue?: string[]; // Filter by specific venues (reduces cloud storage scan scope)
  folder?: string[]; // Filter by folder/instrument type (spot, perpetuals, etc.)
  data_type?: string[]; // Filter by data type (trades, book_snapshot_5, etc.)
  include_sub_dimensions?: boolean;
  include_dates_list?: boolean; // Include actual dates found for deploy missing
  full_dates_list?: boolean; // Return complete date lists without truncation
  check_upstream_availability?: boolean; // Check upstream data exists before counting as "expected"
  first_day_of_month_only?: boolean; // Only check first day of each month (TARDIS free tier)
  freshness_date?: string; // Only count data as 'found' if blob updated on/after this datetime (YYYY-MM-DD or YYYY-MM-DDTHH:MM:SS)
  signal?: AbortSignal; // For cancelling the request
}): Promise<TurboDataStatusResponse> {
  const searchParams = new URLSearchParams();
  searchParams.set("service", params.service);
  searchParams.set("start_date", params.start_date);
  searchParams.set("end_date", params.end_date);
  if (params.mode) {
    searchParams.set("mode", params.mode);
  }
  if (params.asset_group) {
    params.asset_group.forEach((c) => searchParams.append("asset_group", c));
  }
  if (params.venue) {
    params.venue.forEach((v) => searchParams.append("venue", v));
  }
  if (params.folder) {
    params.folder.forEach((f) => searchParams.append("folder", f));
  }
  if (params.data_type) {
    params.data_type.forEach((dt) => searchParams.append("data_type", dt));
  }
  if (params.include_sub_dimensions) {
    searchParams.set("include_sub_dimensions", "true");
  }
  if (params.include_dates_list) {
    searchParams.set("include_dates_list", "true");
  }
  if (params.full_dates_list) {
    searchParams.set("full_dates_list", "true");
  }
  if (params.check_upstream_availability) {
    searchParams.set("check_upstream_availability", "true");
  }
  if (params.first_day_of_month_only) {
    searchParams.set("first_day_of_month_only", "true");
  }
  if (params.freshness_date) {
    searchParams.set("freshness_date", params.freshness_date);
  }
  return fetchJson(`/data-status/turbo?${searchParams.toString()}`, {
    signal: params.signal,
  });
}

/**
 * Get data status from manifest availability indices (fastest path).
 * Reads consolidated parquet index files instead of listing blobs.
 * Works with both GCS and S3 (cloud-agnostic).
 * Returns the same shape as turbo for UI compatibility.
 *
 * Phase 2 of data_status_multi_axis_shard_propagation_2026_05_06.plan
 * adds optional `secondary_axis` + per-shard filter params (league_id /
 * fixture_id / canonical_question_group / job_id / chain) for the
 * deployment-ui axis-selector drill-down. Empty/omitted == today's
 * behaviour. The rollup fast-path is bypassed by deployment-api when any
 * row filter is set (rollup is filter-free), so filtered queries fall
 * through to the on-demand path automatically.
 */
export async function getDataStatusManifest(params: {
  service: string;
  start_date: string;
  end_date: string;
  asset_group?: string[];
  secondary_axis?: string;
  league_id?: string;
  fixture_id?: string;
  canonical_question_group?: string;
  job_id?: string;
  chain?: string;
  // Phase 8B of features_repo_consolidation_2026_05_08.plan — slice the
  // manifest by feature_family. UAC `FeatureFamily` enum values
  // (calendar / commodity / cross_instrument / delta_one /
  // multi_timeframe / onchain / sports / volatility). Empty/omitted ==
  // unfiltered behaviour preserved.
  feature_family?: FeatureFamily | string;
  signal?: AbortSignal;
}): Promise<TurboDataStatusResponse> {
  const searchParams = new URLSearchParams();
  searchParams.set("service", params.service);
  searchParams.set("start_date", params.start_date);
  searchParams.set("end_date", params.end_date);
  if (params.asset_group) {
    params.asset_group.forEach((c) => searchParams.append("asset_group", c));
  }
  if (params.secondary_axis) searchParams.set("secondary_axis", params.secondary_axis);
  if (params.league_id) searchParams.set("league_id", params.league_id);
  if (params.fixture_id) searchParams.set("fixture_id", params.fixture_id);
  if (params.canonical_question_group) {
    searchParams.set("canonical_question_group", params.canonical_question_group);
  }
  if (params.job_id) searchParams.set("job_id", params.job_id);
  if (params.chain) searchParams.set("chain", params.chain);
  if (params.feature_family) {
    searchParams.set("feature_family", params.feature_family);
  }
  return fetchJson(`/data-status/manifest?${searchParams.toString()}`, {
    signal: params.signal,
  });
}

/**
 * Per-(service, asset_group) shard / display / primary axis SSOT.
 *
 * Source: unified_api_contracts.registry.data_status_axis_matrix (Phase 0
 * of data_status_multi_axis_shard_propagation_2026_05_06.plan). Drives
 * the axis-selector dropdowns in DataStatusTab — DEFI panels render a
 * chain dropdown, sports a league_id dropdown, strategy/execution a
 * job_id picker, ml-training a model_family + training_period selector,
 * etc. The four maps are keyed `service -> asset_group -> tuple|str`.
 *
 * `breakdown_axes` is the union of shard + display minus primary,
 * preserving the SHARD-then-DISPLAY ordering — the
 * `BreakdownsAccordion` consumes this directly.
 */
export interface ShardAxisMatrixResponse {
  shard_axes: Record<string, Record<string, string[]>>;
  display_axes: Record<string, Record<string, string[]>>;
  primary_axis: Record<string, Record<string, string>>;
  breakdown_axes: Record<string, Record<string, string[]>>;
}

export async function getShardAxisMatrix(service?: string, signal?: AbortSignal): Promise<ShardAxisMatrixResponse> {
  const qs = service ? `?service=${encodeURIComponent(service)}` : "";
  return fetchJson(`/config/shard-axis-matrix${qs}`, { signal });
}

// Coverage summary — manifest totals + latest-day unique instrument counts.
//
// Phase 2 of data_status_multi_axis_shard_propagation_2026_05_06.plan
// adds the `breakdowns` map: per-axis (chain / league_id / job_id /
// model_family / canonical_question_group / etc.) value->count from the
// UAC SHARD_AXIS_MATRIX SSOT. Each axis's empty `{}` means the axis
// applies to this (service, asset_group) per the SSOT but no manifest
// row has populated it yet — render an empty selector + "no data yet"
// placeholder. Old rows with an empty value collapse under the
// synthetic `__legacy__` key so the UI can call them out as
// pre-Phase-1B.
export interface CoverageCategorySummary {
  total_shards: number;
  total_instrument_rows: number;
  total_instruments?: number;
  unique_dates: number;
  unique_venues: number;
  sub_dimension_label?: string;
  group_axis?: string;
  date_range: { start: string; end: string } | null;
  latest_day: string | null;
  latest_day_instruments: Record<string, number>;
  latest_day_total: number;
  breakdowns?: Record<string, Record<string, number>>;
}

export interface CoverageSummaryResponse {
  service: string;
  asset_groups: Record<string, CoverageCategorySummary>;
  totals: {
    shards: number;
    instrument_rows: number;
    dates_across_asset_groups: number;
    latest_day_instruments: number;
    /** Catalogue-deduplicated identity count (sum across AGs); null pre-rollout. */
    unique_instruments?: number | null;
  };
  totals_source?: "rollup" | "manifest";
  served_from?: string;
  mock?: boolean;
}

export async function getDataCoverageSummary(params?: {
  service?: string;
  asset_groups?: string;
  signal?: AbortSignal;
}): Promise<CoverageSummaryResponse> {
  const searchParams = new URLSearchParams();
  if (params?.service) searchParams.set("service", params.service);
  if (params?.asset_groups) searchParams.set("asset_groups", params.asset_groups);
  const qs = searchParams.toString();
  return fetchJson(`/data-status/coverage-summary${qs ? `?${qs}` : ""}`, {
    signal: params?.signal,
  });
}

// Get available filters for a specific venue
export interface VenueFiltersResponse {
  asset_group: string;
  venue: string;
  folders: string[];
  data_types: string[];
  instrument_types: string[];
  start_date?: string;
  error?: string;
}

export async function getVenueFilters(assetGroup: string, venue: string): Promise<VenueFiltersResponse> {
  const searchParams = new URLSearchParams();
  searchParams.set("asset_group", assetGroup);
  searchParams.set("venue", venue);
  return fetchJson(`/data-status/venue-filters?${searchParams.toString()}`);
}

// Venue detail drill-down — reads a parquet file and returns instrument breakdown
export interface VenueDetailResult {
  venue: string;
  // ``asset_group`` mirrors the Python ``category`` field.  The backend now
  // emits both ``category`` and ``asset_group`` (computed_field alias) so this
  // key is always present.  SSOT: prediction_manifest_canonicalisation_2026_06_01.md.
  asset_group: string;
  /** Legacy field name from the Python VenueDetailResponse (``category``).
   * Prefer ``asset_group``; both carry the same value. */
  category?: string;
  date?: string;
  day?: string | null;
  total_instruments: number;
  total_instruments_unfiltered?: number;
  columns?: string[];
  instrument_types?: Record<string, number>;
  statuses?: Record<string, number>;
  instruments?: Array<{
    key: string;
    type: string;
    base?: string;
    quote?: string;
    // Prediction v9 (canonical_question_group) venue-detail fields.
    // Populated by deployment-api ``_prediction_venue_detail`` when the
    // asset_group is PREDICTION.  SSOT: shard_detail.py:1405-1423.
    canonical_question_group?: string;
    instrument_count?: number;
    pipeline_mode?: string;
    source?: string;
  }>;
}

export async function fetchVenueDetail(
  service: string,
  assetGroup: string,
  venue: string,
  date?: string,
): Promise<VenueDetailResult> {
  const searchParams = new URLSearchParams();
  searchParams.set("service", service);
  searchParams.set("asset_group", assetGroup);
  searchParams.set("venue", venue);
  if (date) searchParams.set("date", date);
  return fetchJson(`/data-status/venue-detail?${searchParams.toString()}`);
}

// List actual files in cloud storage (GCS or S3) for a fully-specified path
export interface FileInfo {
  name: string;
  full_path: string;
  size_bytes: number;
  updated: string | null;
}

export interface DateFileResult {
  date: string;
  prefix: string;
  file_count: number;
  total_size_bytes: number;
  /** ISO timestamp of the most recent blob update for this date (null if no files or error) */
  last_modified?: string | null;
  files: FileInfo[];
  error?: string;
}

export interface ListFilesResponse {
  service: string;
  bucket: string;
  asset_group: string;
  venue: string;
  folder: string;
  data_type: string;
  timeframe: string | null;
  date_range: {
    start: string;
    end: string;
    total_days: number;
  };
  summary: {
    total_files: number;
    total_size_bytes: number;
    total_size_formatted: string;
    dates_with_data: number;
    dates_empty: number;
    completion_pct: number;
  };
  by_date: DateFileResult[];
  error?: string;
  suggestion?: string;
}

export async function listFiles(params: {
  service: string;
  asset_group: string;
  venue: string;
  folder: string;
  data_type: string;
  start_date: string;
  end_date: string;
  timeframe?: string;
  signal?: AbortSignal;
}): Promise<ListFilesResponse> {
  const searchParams = new URLSearchParams();
  searchParams.set("service", params.service);
  searchParams.set("asset_group", params.asset_group);
  searchParams.set("venue", params.venue);
  searchParams.set("folder", params.folder);
  searchParams.set("data_type", params.data_type);
  searchParams.set("start_date", params.start_date);
  searchParams.set("end_date", params.end_date);
  if (params.timeframe) {
    searchParams.set("timeframe", params.timeframe);
  }
  const raw = await fetchJson<unknown>(`/data-status/list-files?${searchParams.toString()}`, {
    signal: params.signal,
  });
  if (raw && typeof raw === "object" && !Array.isArray(raw)) {
    const r = raw as Record<string, unknown>;
    if ("category" in r && !("asset_group" in r)) {
      const { category, ...rest } = r;
      return { ...rest, asset_group: category ?? "" } as ListFilesResponse;
    }
  }
  return raw as ListFilesResponse;
}

// Services that require upstream availability check for accurate missing data
// These services depend on data from upstream services, so we can only count
// "missing" for dates where upstream data actually exists
export const UPSTREAM_CHECK_SERVICES = [
  "market-data-processing-service", // Depends on market-tick-data-handler (raw_tick_data)
  "features-delta-one-service", // Depends on market-data-processing-service (processed_candles)
];

// Services that support turbo mode (GCS/S3 blob listing — L1-L3 dimension-based)
//
// 2026-05-06: removed market-data-processing-service from this list. Its turbo
// path hangs >90s on a 1-day window in local dev (the service has too many
// per-(date, venue, data_type, instrument_type) shards for the GCS-listing-based
// turbo aggregator). MDPS is already in MANIFEST_MODE_SERVICES below; the
// manifest-based path is faster and was specifically built for high-cardinality
// services like this one. Keeping it in both lists caused the UI to fall back
// to turbo and time out before the manifest path got tried.
export const TURBO_MODE_SERVICES = [
  "instruments-service",
  "market-tick-data-handler",
  "features-delta-one-service",
  "features-calendar-service",
  "features-onchain-service",
  "features-volatility-service",
  "features-sports-service",
  "features-multi-timeframe-service",
  "features-cross-instrument-service",
  "features-commodity-service",
];

// Services that support manifest mode (fast parquet index reads — any service with ManifestWriter)
export const MANIFEST_MODE_SERVICES = [
  "instruments-service",
  "market-tick-data-service",
  "market-data-processing-service",
  "features-onchain-service",
  "features-delta-one-service",
  "features-volatility-service",
  "features-calendar-service",
  "features-sports-service",
  "features-multi-timeframe-service",
  "features-cross-instrument-service",
  "features-commodity-service",
  // L4-L6: Rich services (config/strategy-based sharding)
  "strategy-service",
  "execution-service",
  "ml-training-service",
  "ml-inference-service",
  "alerting-service",
];

// Config-based services (L4-L5) — sharding from GCS configs, not fixed dimensions
export const CONFIG_BASED_SERVICES = [
  "strategy-service",
  "execution-service",
  "ml-training-service",
  "ml-inference-service",
];

// Services with no date dimension (use "none" date granularity)
export const NO_DATE_SERVICES = ["ml-training-service"];

// Services with sub-dimension breakdown support
export const TURBO_SUB_DIMENSION_SERVICES: { [service: string]: string } = {
  "instruments-service": "venue",
  "market-tick-data-handler": "data_type",
  "market-tick-data-service": "data_type",
  "market-data-processing-service": "data_type",
  "features-delta-one-service": "feature_group",
  "features-calendar-service": "feature_group",
  "features-volatility-service": "feature_group",
  "features-onchain-service": "feature_group",
  "features-sports-service": "feature_group",
  "features-multi-timeframe-service": "feature_group",
  "features-cross-instrument-service": "feature_group",
  "features-commodity-service": "feature_group",
  // L4-L6 config-based services
  "strategy-service": "strategy_id",
  "execution-service": "domain",
  "ml-training-service": "model_id",
  "ml-inference-service": "mode",
  "alerting-service": "alert_type",
};

/** One asset group's venue-coverage check block (``check_venues`` mode). */
export interface VenueCheckAssetGroupBlock {
  dates_with_missing_venues: Array<{
    date: string;
    missing: string[];
    file_exists: boolean;
  }>;
  total_dates: number;
}

// Venue Check Response type (when check_venues=true)
export interface VenueCheckResponse {
  service: string;
  start_date: string;
  end_date: string;
  asset_groups: Record<string, VenueCheckAssetGroupBlock>;
}

// Data Type Check Response type (when check_data_types=true)
export interface DataTypeCheckResponse {
  service: string;
  start_date: string;
  end_date: string;
  overall_completion: number;
  overall_complete: number;
  overall_total: number;
  venues: {
    [venue: string]: {
      completion_percent: number;
      complete: number;
      total: number;
      data_types: {
        [dataType: string]: {
          found: number;
          expected: number;
          completion_percent: number;
        };
      };
      feature_groups?: Record<string, TurboFeatureGroupStatus>;
      feature_families?: { [family: string]: TurboFeatureFamilyStatus };
      timeframes?: Record<string, DimensionStatus>;
    };
  };
}

export async function getMissingShards(params: {
  service: string;
  start_date: string;
  end_date: string;
  mode?: string;
  asset_group?: string[];
  venue?: string[];
}): Promise<MissingShardsResponse> {
  const searchParams = new URLSearchParams();
  searchParams.set("service", params.service);
  searchParams.set("start_date", params.start_date);
  searchParams.set("end_date", params.end_date);
  if (params.mode) {
    searchParams.set("mode", params.mode);
  }
  if (params.asset_group) {
    params.asset_group.forEach((c) => searchParams.append("asset_group", c));
  }
  if (params.venue) {
    params.venue.forEach((v) => searchParams.append("venue", v));
  }
  return fetchJson(`/data-status/missing-shards?${searchParams.toString()}`);
}

// ============================================================================
// Execution Services Data Status
// ============================================================================

// Config-level day breakdown for execution services
export interface ExecutionConfigInfo {
  config_file: string;
  algo_name: string;
  result_strategy_id: string;
  has_results: boolean;
  result_dates: string[];
  // Day breakdown fields (when include_dates_list=true)
  dates_found_count?: number;
  dates_found_list?: string[];
  dates_found_list_tail?: string[];
  dates_found_truncated?: boolean;
  dates_missing_count?: number;
  dates_missing_list?: string[];
  dates_missing_list_tail?: string[];
  dates_missing_truncated?: boolean;
  completion_pct?: number;
}

export interface ExecutionTimeframeStatus {
  timeframe: string;
  total: number;
  with_results: number;
  completion_pct: number;
  missing_configs: Array<{ config_file: string; algo_name: string }>;
  configs: ExecutionConfigInfo[];
}

export interface ExecutionModeStatus {
  mode: string;
  total: number;
  with_results: number;
  completion_pct: number;
  timeframes: ExecutionTimeframeStatus[];
}

export interface ExecutionStrategyStatus {
  strategy: string;
  total: number;
  with_results: number;
  completion_pct: number;
  result_dates: string[];
  result_date_count: number;
  modes: ExecutionModeStatus[];
}

export interface ExecutionBreakdownItem {
  total: number;
  with_results: number;
  missing_count: number;
  completion_pct: number;
  missing_samples: string[];
}

export interface ExecutionDataStatusResponse {
  config_path: string;
  version: string;
  total_configs: number;
  configs_with_results: number;
  missing_count: number;
  completion_pct: number;
  strategy_count: number;
  strategies: ExecutionStrategyStatus[];
  breakdown_by_mode: Record<string, ExecutionBreakdownItem>;
  breakdown_by_timeframe: Record<string, ExecutionBreakdownItem>;
  breakdown_by_algo: Record<string, ExecutionBreakdownItem>;
  date_filter?: {
    start: string | null;
    end: string | null;
  };
  error?: string;
}

export async function getExecutionDataStatus(params: {
  config_path: string;
  start_date?: string;
  end_date?: string;
  include_dates_list?: boolean;
}): Promise<ExecutionDataStatusResponse> {
  const searchParams = new URLSearchParams();
  searchParams.set("config_path", params.config_path);
  if (params.start_date) searchParams.set("start_date", params.start_date);
  if (params.end_date) searchParams.set("end_date", params.end_date);
  if (params.include_dates_list) searchParams.set("include_dates_list", "true");
  return fetchJson(`/service-status/execution-services/data-status?${searchParams.toString()}`);
}

// Execution Services Missing Shards
export interface ExecutionMissingShard {
  config_gcs: string; // Legacy; gs:// path
  config_path?: string; // Cloud-agnostic (gs:// or s3://)
  date: string;
  strategy: string;
  mode: string;
  timeframe: string;
  algo: string;
}

export interface ExecutionMissingShardsResponse {
  missing_shards: ExecutionMissingShard[];
  total_missing: number;
  total_configs: number;
  total_dates: number;
  breakdown: {
    by_strategy: Record<string, number>;
    by_mode: Record<string, number>;
    by_timeframe: Record<string, number>;
    by_algo: Record<string, number>;
    by_date: Record<string, number>;
  };
  filters: {
    config_path: string;
    start_date: string;
    end_date: string;
    strategy?: string | null;
    mode?: string | null;
    timeframe?: string | null;
    algo?: string | null;
  };
  error?: string;
}

export async function getExecutionMissingShards(params: {
  config_path: string;
  start_date: string;
  end_date: string;
  strategy?: string;
  mode?: string;
  timeframe?: string;
  algo?: string;
}): Promise<ExecutionMissingShardsResponse> {
  const searchParams = new URLSearchParams();
  searchParams.set("config_path", params.config_path);
  searchParams.set("start_date", params.start_date);
  searchParams.set("end_date", params.end_date);
  if (params.strategy) searchParams.set("strategy", params.strategy);
  if (params.mode) searchParams.set("mode", params.mode);
  if (params.timeframe) searchParams.set("timeframe", params.timeframe);
  if (params.algo) searchParams.set("algo", params.algo);
  return fetchJson(`/service-status/execution-services/missing-shards?${searchParams.toString()}`, {
    method: "POST",
  });
}

// Service Status (Temporal Audit Trail)
export async function getServiceStatus(serviceName: string): Promise<ServiceStatus> {
  return fetchJson(`/service-status/${serviceName}/status`);
}

export async function getServicesOverview(): Promise<ServicesOverview> {
  return fetchJson("/service-status/overview");
}

// Capabilities (API runtime info for UI display)
export interface CapabilitiesResponse {
  gcs_fuse: { active: boolean; env?: string; reason?: string };
}

export async function getCapabilities(): Promise<CapabilitiesResponse> {
  return fetchJson("/capabilities");
}

export interface ServiceAssetGroupsResponse {
  service: string;
  asset_groups: string[];
}

export async function getServiceAssetGroups(serviceName: string): Promise<ServiceAssetGroupsResponse> {
  return fetchJson(`/capabilities/service-asset-groups/${serviceName}`);
}

// Cache Management
export interface ClearCacheResponse {
  status: string;
  cleared: number;
  message?: string;
  error?: string;
}

export async function clearCache(): Promise<ClearCacheResponse> {
  return fetchJson("/cache/clear", { method: "POST" });
}

// Clear only data status cache (doesn't affect deployment state cache)
export async function clearDataStatusCache(): Promise<{
  status: string;
  entries_cleared: number;
}> {
  return fetchJson("/data-status/turbo/clear", { method: "POST" });
}

// ---------------------------------------------------------------------------
// Drill-down (schema / instruments / bucket counts / CSV download)
// ---------------------------------------------------------------------------

export interface SchemaColumnSpec {
  name: string;
  dtype: string;
  nullable: boolean;
  description: string;
}

export interface ShardSchemaResponse {
  registered: boolean;
  asset_group: string;
  instrument_type: string;
  data_type: string;
  venue: string | null;
  symbol_column: string | null;
  /**
   * Source of the schema columns:
   * - `CONTRACT_REGISTRY` / `VENUE_CONTRACT_OVERRIDES` — UAC contract.
   * - `PARQUET_PROJECTION` — registry has no entry, columns are
   *   projected from the actual parquet on GCS at `projected_from`.
   *   Phase 3 of data_status_multi_axis_shard_propagation_2026_05_06.plan.
   * - `none` — no contract AND no parquet found; the UI should show
   *   "no schema yet" rather than blank.
   */
  source: string;
  columns: SchemaColumnSpec[];
  required_row_count_min?: number;
  message?: string;
  projected_from?: string;
  /**
   * GCS URIs the projection probed when ``source === "none"``. Surfaced
   * in the modal so a path-drift bug is actionable — operator can run
   * ``gcloud storage ls <uri>`` and see whether the parquet exists at
   * a different layout than the projection template expects.
   */
  probed_paths?: string[];
}

export async function fetchShardSchema(params: {
  service: string;
  asset_group: string;
  instrument_type: string;
  data_type: string;
  venue?: string;
  // v7 multi-axis params (Phase 3 of
  // data_status_multi_axis_shard_propagation_2026_05_06.plan). The
  // /api/data-status/schema endpoint uses these to probe the DEEPEST
  // shard parquet — DEFI per-chain, sports per-league/per-fixture, ML
  // per-experiment-run, strategy/execution per-job_id, etc. Each leaf
  // parquet has its own column shape; the schema view should never
  // collapse or aggregate.
  day?: string;
  chain?: string;
  instrument_id?: string;
  league_id?: string;
  fixture_id?: string;
  canonical_question_group?: string;
  job_id?: string;
  model_family?: string;
  training_period?: string;
  strategy_id?: string;
  instruction_type?: string;
  feature_group?: string;
  timeframe?: string;
  // Phase 8B feature_family filter for the consolidated features-service.
  feature_family?: FeatureFamily | string;
}): Promise<ShardSchemaResponse> {
  const qp = new URLSearchParams({
    service: params.service,
    asset_group: params.asset_group,
    instrument_type: params.instrument_type,
    data_type: params.data_type,
  });
  if (params.venue) qp.set("venue", params.venue);
  if (params.day) qp.set("day", params.day);
  if (params.chain) qp.set("chain", params.chain);
  if (params.instrument_id) qp.set("instrument_id", params.instrument_id);
  if (params.league_id) qp.set("league_id", params.league_id);
  if (params.fixture_id) qp.set("fixture_id", params.fixture_id);
  if (params.canonical_question_group) {
    qp.set("canonical_question_group", params.canonical_question_group);
  }
  if (params.job_id) qp.set("job_id", params.job_id);
  if (params.model_family) qp.set("model_family", params.model_family);
  if (params.training_period) qp.set("training_period", params.training_period);
  if (params.strategy_id) qp.set("strategy_id", params.strategy_id);
  if (params.instruction_type) qp.set("instruction_type", params.instruction_type);
  if (params.feature_group) qp.set("feature_group", params.feature_group);
  if (params.timeframe) qp.set("timeframe", params.timeframe);
  if (params.feature_family) qp.set("feature_family", params.feature_family);
  return fetchJson<ShardSchemaResponse>(`/data-status/schema?${qp.toString()}`);
}

// ---------------------------------------------------------------------------
// ShardDetail / VenueDetail v2 — unified shard drilldown contract.
// Upstream: deployment-api types/shard_detail.py (commit 9d93236).
// ---------------------------------------------------------------------------

export type ShardClassLiteral = "grouped" | "per_symbol" | "reference" | "fixtures";

export type CaptureStatusLiteral = "captured" | "empty_confirmed" | "attempted_failed" | "missing";

// Mirrors UAC ``ServiceEmissionStateEnum`` (writegate slice (b) / v8). The
// SSOT for the value set is the Python enum at
// ``unified_api_contracts.canonical.crosscutting.service_emission_state``;
// this TS union is the type-level alias for the API response shape. Drift
// between these and the UAC enum is review-blocking.
export type ServiceEmissionState = "PUBLISHED_OK" | "PUBLISHED_DEGRADED" | "STALE_DATA_HEARTBEAT_ONLY" | "BLOCKED";

export interface ShardDetailCoord {
  service: string;
  asset_group: string;
  instrument_type: string;
  data_type: string;
  day: string;
  venue: string | null;
  underlying: string | null;
  instrument_id: string | null;
}

export interface ShardDetailColumn {
  name: string;
  dtype: string;
  nullable: boolean;
  required: boolean;
  provided_by_venues: string[] | null;
  description: string;
}

export interface ShardDetailSchema {
  registered: boolean;
  source: "CONTRACT_REGISTRY" | "VENUE_CONTRACT_OVERRIDES" | "none";
  symbol_column: string | null;
  columns: ShardDetailColumn[];
  message: string;
  // ``explicit`` — caller passed a concrete instrument_type;
  // ``auto`` — caller passed ``"AUTO"``/``"UNKNOWN"`` and the backend
  //   resolved it from the UAC SchemaContract registry;
  // ``none`` — auto resolution was requested but no contract matched.
  // Optional for backwards compatibility with older API responses.
  instrument_type_resolved_via?: "explicit" | "auto" | "none";
}

export interface ShardDetailGcs {
  path: string | null;
  file_size_bytes: number | null;
  row_count: number | null;
  captured_at: string | null;
  capture_status: CaptureStatusLiteral;
  error_reason: string | null;
  // v8 manifest columns (writegate Phase 4 — surfaced via deployment-api
  // ``ShardGcsMetadata``). All four optional + nullable for forward-compat
  // with pre-v8 manifest rows that lack these columns. UI renders the
  // ``ServiceEmissionStateBadge`` next to ``capture_status`` and a small
  // ``pipeline_mode`` label when populated; a muted ``—`` placeholder
  // when null/undefined.
  pipeline_mode?: string | null;
  service_emission_state?: ServiceEmissionState | null;
  last_emission_decision_at?: string | null;
  expected_window_completeness_fraction?: number | null;
}

export interface ShardDetailDownloadUrls {
  parquet_signed_url: string | null;
  csv_projected: string | null;
}

export interface ShardDetailPayloadGrouped {
  instrument_list: Record<string, string>[];
}

export interface ShardDetailPayloadPerSymbol {
  instrument_list: Record<string, string>[];
}

export interface ShardDetailPayloadReference {
  instrument_definitions: Record<string, unknown>[];
}

export interface ShardDetailPayloadFixtures {
  fixtures: Record<string, unknown>[];
}

export interface ShardDetailResponse {
  coord: ShardDetailCoord;
  shard_class: ShardClassLiteral;
  schema: ShardDetailSchema;
  gcs: ShardDetailGcs;
  download_urls: ShardDetailDownloadUrls;
  sample_rows: Record<string, unknown>[];
  payload_grouped: ShardDetailPayloadGrouped | null;
  payload_per_symbol: ShardDetailPayloadPerSymbol | null;
  payload_reference: ShardDetailPayloadReference | null;
  payload_fixtures: ShardDetailPayloadFixtures | null;
}

export async function fetchShardDetail(params: {
  service: string;
  asset_group: string;
  instrument_type: string;
  data_type: string;
  day: string;
  venue?: string | null;
  underlying?: string | null;
  instrument_id?: string | null;
}): Promise<ShardDetailResponse> {
  const qp = new URLSearchParams({
    service: params.service,
    asset_group: params.asset_group,
    instrument_type: params.instrument_type,
    data_type: params.data_type,
    day: params.day,
  });
  if (params.venue) qp.set("venue", params.venue);
  if (params.underlying) qp.set("underlying", params.underlying);
  if (params.instrument_id) qp.set("instrument_id", params.instrument_id);
  return fetchJson<ShardDetailResponse>(`/data-status/shard-detail?${qp.toString()}`);
}

// LeafParquetStats — writegate Phase 4.A.3 (deployment-api@3b0477a).
// Live per-leaf-parquet stats: row count, per-column non_null + NaN ratio,
// available_at envelope (min / max ISO + null count), and file size.
// Distinct from `fetchShardSchema` which returns the DECLARED SchemaContract.
// Used by LeafSchemaModal (Phase 4.B.3) to surface real shard health
// alongside the contract-declared columns.
export interface LeafParquetColumnStat {
  name: string;
  dtype: string;
  non_null_count: number;
  null_count: number;
  nan_ratio: number;
}

export interface LeafAvailableAtEnvelope {
  present: boolean;
  min_iso: string | null;
  max_iso: string | null;
  null_count: number;
}

export interface LeafCompletenessEnvelope {
  present: boolean;
  min_fraction: number | null;
  max_fraction: number | null;
  mean_fraction: number | null;
  null_count: number;
  incomplete_window_present_count: number;
}

export interface LeafParquetStatsResponse {
  coord: {
    service: string;
    asset_group: string;
    instrument_type: string;
    data_type: string;
    day: string;
    venue: string | null;
    underlying: string | null;
    instrument_id: string | null;
  };
  gs_uri: string | null;
  available: boolean;
  error_reason: string | null;
  row_count: number;
  column_count: number;
  columns: LeafParquetColumnStat[];
  available_at: LeafAvailableAtEnvelope;
  /** Writegate slice (b) Phase 5.5 — completeness envelope (forward-compatible).
   * `present: false` when the parquet predates the slice (c) per-service
   * emission-policy rollout. UI renders a placeholder pill in that case. */
  completeness: LeafCompletenessEnvelope;
  file_size_bytes: number | null;
  truncated: boolean;
  truncated_at_rows: number | null;
}

export async function fetchLeafParquetStats(params: {
  service: string;
  asset_group: string;
  instrument_type: string;
  data_type: string;
  day: string;
  venue?: string | null;
  underlying?: string | null;
  instrument_id?: string | null;
  // Phase 8B feature_family filter for the consolidated features-service.
  feature_family?: FeatureFamily | string | null;
}): Promise<LeafParquetStatsResponse> {
  const qp = new URLSearchParams({
    service: params.service,
    asset_group: params.asset_group,
    instrument_type: params.instrument_type,
    data_type: params.data_type,
    day: params.day,
  });
  if (params.venue) qp.set("venue", params.venue);
  if (params.underlying) qp.set("underlying", params.underlying);
  if (params.instrument_id) qp.set("instrument_id", params.instrument_id);
  if (params.feature_family) qp.set("feature_family", params.feature_family);
  return fetchJson<LeafParquetStatsResponse>(`/data-status/leaf-stats?${qp.toString()}`);
}

// VenueDetail v2 — DeFi-aware.  Composite (PROTOCOL-CHAIN) vs chain-only
// paths are disambiguated via ``chain`` / ``protocol`` / ``pools`` /
// ``protocols`` being populated.  CeFi branches populate ``instruments`` +
// ``total_instruments``.
export interface VenueDetailV2Response {
  asset_group: string;
  venue: string;
  chain: string | null;
  protocol: string | null;
  total_instruments: number;
  total_instruments_unfiltered?: number;
  total_pools: number;
  total_tokens: number;
  instruments: Record<string, unknown>[];
  protocols: Record<string, unknown>[];
  pools: Record<string, unknown>[];
  tokens: Record<string, unknown>[];
  day: string | null;
}

export async function fetchVenueDetailV2(params: {
  service: string;
  asset_group: string;
  venue: string;
}): Promise<VenueDetailV2Response> {
  const qp = new URLSearchParams({
    service: params.service,
    asset_group: params.asset_group,
    venue: params.venue,
  });
  return fetchJson<VenueDetailV2Response>(`/data-status/venue-detail?${qp.toString()}`);
}

export interface ShardInstrumentEntry {
  instrument_id: string;
  file_uri: string;
  size_bytes: number;
  bundled_under?: string;
  // Phase-C honest-coverage: manifest capture metadata surfaced per
  // instrument so the drill-down can badge + retry failed shards.
  capture_status?: "captured" | "empty_confirmed" | "attempted_failed";
  error_reason?: string;
  attempted_at?: string;
}

export interface InstrumentsForShardResponse {
  service: string;
  asset_group: string;
  venue: string;
  day: string;
  instrument_type: string;
  data_type: string;
  bundling: "per_symbol" | "per_underlying" | "per_condition_id";
  instruments: ShardInstrumentEntry[];
  bucket: string;
  prefix: string;
  total_count: number;
  limit: number;
  offset: number;
  has_more: boolean;
  search: string;
}

// Phase C (honest-coverage): retry a single failed shard day by triggering
// deploy-missing for the (service, date, venue, category) tuple with force=true.
// The server already owns the scheduling + VM spawn — we just re-enqueue the
// single shard. ``dry_run: false`` so it actually runs.
export async function retryFailedShard(params: {
  service: string;
  asset_group: string;
  venue: string;
  day: string;
}): Promise<{
  deployment?: { deployment_id?: string } | null;
  message?: string;
}> {
  return fetchJson<{
    deployment?: { deployment_id?: string } | null;
    message?: string;
  }>("/deployments/deploy-missing", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      service: params.service,
      asset_group: params.asset_group.toLowerCase(),
      venue: params.venue,
      start_date: params.day,
      end_date: params.day,
      force: true,
      dry_run: false,
      deploy_missing_only: false,
      mode: "batch",
    }),
  });
}

export async function fetchInstrumentsForShard(params: {
  service: string;
  asset_group: string;
  venue: string;
  day: string;
  instrument_type: string;
  data_type: string;
  limit?: number;
  offset?: number;
  search?: string;
}): Promise<InstrumentsForShardResponse> {
  const qp = new URLSearchParams({
    service: params.service,
    asset_group: params.asset_group,
    venue: params.venue,
    day: params.day,
    instrument_type: params.instrument_type,
    data_type: params.data_type,
  });
  if (params.limit !== undefined) qp.set("limit", String(params.limit));
  if (params.offset !== undefined) qp.set("offset", String(params.offset));
  if (params.search !== undefined && params.search !== "") qp.set("search", params.search);
  return fetchJson<InstrumentsForShardResponse>(`/data-status/instruments-for-shard?${qp.toString()}`);
}

export interface BundlePreviewResponse {
  bundling: string;
  underlying?: string;
  file_uri?: string;
  symbol_column?: string;
  symbols: string[];
  message?: string;
}

export interface ShardInfoResponse {
  service: string;
  asset_group: string;
  venue: string;
  day: string;
  data_type: string;
  instrument_types: { name: string; bundling: string }[];
  recommended_instrument_type: string | null;
}

export async function fetchShardInfo(params: {
  service: string;
  asset_group: string;
  venue: string;
  day: string;
  data_type: string;
}): Promise<ShardInfoResponse> {
  const qp = new URLSearchParams(params);
  return fetchJson<ShardInfoResponse>(`/data-status/shard-info?${qp.toString()}`);
}

export async function fetchBundlePreview(params: {
  service: string;
  asset_group: string;
  venue: string;
  day: string;
  instrument_type: string;
  data_type: string;
  limit?: number;
}): Promise<BundlePreviewResponse> {
  const qp = new URLSearchParams({
    service: params.service,
    asset_group: params.asset_group,
    venue: params.venue,
    day: params.day,
    instrument_type: params.instrument_type,
    data_type: params.data_type,
  });
  if (params.limit !== undefined) qp.set("limit", String(params.limit));
  return fetchJson<BundlePreviewResponse>(`/data-status/bundle-preview?${qp.toString()}`);
}

export interface BucketCountsResponse {
  named_market_count: number;
  other_market_count: number;
}

export async function fetchBucketCounts(params: {
  service: string;
  asset_group: string;
  venue: string;
  day: string;
  data_type: string;
}): Promise<BucketCountsResponse> {
  const qp = new URLSearchParams(params);
  return fetchJson<BucketCountsResponse>(`/data-status/bucket-counts?${qp.toString()}`);
}

/** Build the CSV download URL — used in an <a href> so the browser handles the download. */
export function buildCsvDownloadUrl(params: {
  service: string;
  asset_group: string;
  venue: string;
  day: string;
  instrument_type: string;
  data_type: string;
  instrument_ids: string[];
  // v7 multi-axis filters — Phase 3 of
  // data_status_multi_axis_shard_propagation_2026_05_06.plan.
  // Server reads manifest capture_status using these axes BEFORE
  // touching the parquet so the response distinguishes empty_confirmed
  // (honest empty) from path_drift (manifest claims captured but
  // downloader can't find rows).
  chain?: string;
  league_id?: string;
  job_id?: string;
}): string {
  const qp = new URLSearchParams({
    service: params.service,
    asset_group: params.asset_group,
    venue: params.venue,
    day: params.day,
    instrument_type: params.instrument_type,
    data_type: params.data_type,
    instrument_ids: params.instrument_ids.join(","),
  });
  if (params.chain) qp.set("chain", params.chain);
  if (params.league_id) qp.set("league_id", params.league_id);
  if (params.job_id) qp.set("job_id", params.job_id);
  return `${API_BASE}/data-status/download-csv?${qp.toString()}`;
}

// Services that write per-venue-day-bundle parquets and support shard CSV download.
export const SHARD_CSV_DOWNLOAD_SERVICES = new Set([
  "instruments-service",
  "corporate-actions",
  "market-tick-data-service",
  "market-data-processing-service",
]);

/**
 * Build the shard CSV download URL for one (service, asset group, venue, date).
 *
 * Routing on the server side:
 * - instruments-service / corporate-actions: reads the per-(venue, day) bundle
 *   parquet and returns its instrument rows as CSV.
 * - market-tick-data-service / market-data-processing-service: returns the
 *   availability-manifest catalog for (venue, date) as CSV — shows which
 *   instruments were captured, their data_type / instrument_type, capture_status,
 *   and any error_reason. Tick data itself is too large to download directly.
 */
export function buildShardDownloadUrl(params: {
  service: string;
  asset_group: string;
  venue: string;
  date: string;
  data_type?: string;
  instrument_type?: string;
  // v7 multi-axis filters (Phase 3 — see buildCsvDownloadUrl above).
  chain?: string;
  league_id?: string;
  job_id?: string;
}): string {
  const qp = new URLSearchParams({
    service: params.service,
    asset_group: params.asset_group,
    venue: params.venue,
    date: params.date,
  });
  if (params.data_type) {
    qp.set("data_type", params.data_type);
  }
  if (params.instrument_type) {
    qp.set("instrument_type", params.instrument_type);
  }
  if (params.chain) qp.set("chain", params.chain);
  if (params.league_id) qp.set("league_id", params.league_id);
  if (params.job_id) qp.set("job_id", params.job_id);
  return `${API_BASE}/data-status/download-shard-csv?${qp.toString()}`;
}

/**
 * Build the sports-FIXTURES CSV download URL for one (day, league) slice.
 * Server reads gs://instruments-store-sports-{pid}/sports_reference/by_date/day={day}/entity=fixtures/fixtures.parquet
 * and filters by canonical league_id (mapped to API-Football numeric id via UAC).
 */
export function buildFixturesCsvDownloadUrl(params: { day: string; league_id: string }): string {
  const qp = new URLSearchParams({
    day: params.day,
    league_id: params.league_id,
  });
  return `${API_BASE}/data-status/download-fixtures-csv?${qp.toString()}`;
}

/**
 * Smart shard CSV download — Phase 3 of
 * data_status_multi_axis_shard_propagation_2026_05_06.plan.
 *
 * Fetches the URL via fetch(), reads the ``X-Capture-Status`` response
 * header, and returns one of five branches so the UI can render the
 * right empty-state panel BEFORE (or alongside) triggering the actual
 * file download. Distinguishes:
 *
 *   - "captured" — manifest claims rows AND parquet read returned >0
 *     rows. Triggers a Blob-based download.
 *   - "empty_confirmed" — adapter ran, source returned 0 rows
 *     legitimately. The response body is a header-only CSV explaining
 *     the honest empty; we still trigger the download (operator sees
 *     the CSV's # comment lines) AND return the status so the caller
 *     can render an inline alert.
 *   - "attempted_failed" — adapter ran and raised. Same shape as
 *     empty_confirmed but the alert flags an error.
 *   - "never_attempted" — manifest has no row at all (HTTP 404). No
 *     file is downloaded; caller renders an inline panel.
 *   - "path_drift" — manifest claims captured but downloader read
 *     0 rows (HTTP 502). No file is downloaded; caller renders a
 *     red banner with the drift hint.
 *   - "unknown" — anything else (network error, 500, missing header).
 *
 * Returns the resolved status + an optional ``message`` from the
 * response body for the non-captured branches.
 */
export type ShardDownloadStatus =
  | "captured"
  | "empty_confirmed"
  | "attempted_failed"
  | "never_attempted"
  | "path_drift"
  | "unknown";

export interface ShardDownloadResult {
  status: ShardDownloadStatus;
  filename?: string;
  message?: string;
  rowCount?: number;
}

export async function smartShardDownload(url: string): Promise<ShardDownloadResult> {
  let resp: Response;
  try {
    resp = await fetch(url, { credentials: "include" });
  } catch (e) {
    return {
      status: "unknown",
      message: e instanceof Error ? e.message : String(e),
    };
  }

  const headerStatus = resp.headers.get("X-Capture-Status") ?? "";
  const rowCountStr = resp.headers.get("X-Row-Count") ?? "";
  const rowCount = rowCountStr ? parseInt(rowCountStr, 10) : undefined;

  // Resolve canonical status. Servers older than Phase 3 deployment-api
  // 85053fe will not set X-Capture-Status; map by HTTP code instead.
  let status: ShardDownloadStatus = "unknown";
  if (
    headerStatus === "captured" ||
    headerStatus === "empty_confirmed" ||
    headerStatus === "attempted_failed" ||
    headerStatus === "never_attempted" ||
    headerStatus === "path_drift"
  ) {
    status = headerStatus;
  } else if (resp.ok) {
    status = "captured";
  } else if (resp.status === 404) {
    status = "never_attempted";
  } else if (resp.status === 502) {
    status = "path_drift";
  }

  // Pull filename from Content-Disposition.
  const cd = resp.headers.get("Content-Disposition") ?? "";
  const fnMatch = /filename="([^"]+)"/.exec(cd);
  const filename = fnMatch?.[1];

  if (!resp.ok) {
    let body = "";
    try {
      body = await resp.text();
    } catch {
      // ignore
    }
    return { status, message: body || resp.statusText, filename };
  }

  // Trigger the actual download for captured AND honest empties /
  // attempted_failed (the body has the explanation in CSV comment lines).
  if (status === "captured" || status === "empty_confirmed" || status === "attempted_failed") {
    let blob: Blob;
    try {
      blob = await resp.blob();
    } catch (e) {
      return {
        status: "unknown",
        message: e instanceof Error ? e.message : String(e),
        rowCount,
      };
    }
    const blobUrl = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = blobUrl;
    a.download = filename ?? "shard.csv";
    a.rel = "noopener";
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(blobUrl);
  }

  return { status, filename, rowCount };
}

/**
 * Per-fixture coverage for one (day, league) slice.
 *
 * ``capture_status`` values per entity match the v5 honest-coverage manifest:
 * ``captured`` / ``empty_confirmed`` / ``missing`` / ``attempted_failed``.
 */
export type FixtureCoverageStatus = "captured" | "empty_confirmed" | "missing" | "attempted_failed";

export interface FixtureCoverageSummary {
  captured: number;
  empty_confirmed: number;
  missing: number;
  failed: number;
}

export interface FixtureBreakdownEntry {
  fixture_id: string;
  kickoff_utc: string;
  home_team_name: string;
  away_team_name: string;
  status: string;
  venue_id: string;
  coverage: Record<string, FixtureCoverageStatus>;
  coverage_summary: FixtureCoverageSummary;
}

export interface FixtureBreakdownResponse {
  day: string;
  league_id: string;
  af_league_id: number | null;
  fixtures_expected: number;
  fixtures: FixtureBreakdownEntry[];
  // "resolved" = master fixtures parquet present (may still be empty).
  // "no_schedule" = master fixtures parquet absent for this day.
  status: "resolved" | "no_schedule";
}

/**
 * Fetch per-fixture coverage for one (day, league_id) — powers the SPORTS
 * fixture-leaf drilldown below the existing per-league date badges.
 */
export async function fetchFixtureBreakdown(params: {
  day: string;
  league_id: string;
}): Promise<FixtureBreakdownResponse> {
  const qp = new URLSearchParams({
    day: params.day,
    league_id: params.league_id,
  });
  const res = await fetch(`${API_BASE}/data-status/fixtures/breakdown?${qp.toString()}`, {
    credentials: "include",
  });
  if (!res.ok) {
    throw new Error(`fetchFixtureBreakdown ${res.status}: ${await res.text()}`);
  }
  return (await res.json()) as FixtureBreakdownResponse;
}

/**
 * Build the per-fixture download URL. ``format='csv'`` returns a
 * denormalised union CSV (one leading ``entity`` column); ``format='json'``
 * returns structured JSON keyed by entity with ``capture_status`` sentinels.
 */
export function buildFixtureDownloadUrl(params: { fixture_id: string; day: string; format: "csv" | "json" }): string {
  const qp = new URLSearchParams({
    fixture_id: params.fixture_id,
    day: params.day,
    format: params.format,
  });
  return `${API_BASE}/data-status/fixtures/download?${qp.toString()}`;
}

// Cloud Builds
export interface BuildInfo {
  build_id: string;
  status: string;
  create_time: string | null;
  finish_time: string | null;
  duration_seconds: number | null;
  commit_sha: string | null;
  branch: string | null;
  log_url: string | null;
}

export interface BuildTrigger {
  trigger_id: string;
  trigger_name: string;
  service: string;
  type?: "service" | "library" | "infrastructure"; // Distinguish service types
  github_repo: string | null;
  branch_pattern: string | null;
  disabled: boolean;
  status: string;
  last_build: BuildInfo | null;
}

export interface BuildTriggersResponse {
  triggers: BuildTrigger[];
  total: number;
  project: string;
  region: string;
}

export interface TriggerBuildResponse {
  success: boolean;
  build_id: string | null;
  log_url: string | null;
  message: string;
  service: string;
  branch: string;
}

export interface BuildHistoryResponse {
  service: string;
  trigger_name: string;
  builds: BuildInfo[];
  total: number;
}

export async function getCloudBuildTriggers(): Promise<BuildTriggersResponse> {
  return fetchJson("/cloud-builds/triggers");
}

export async function triggerCloudBuild(service: string, branch: string = "main"): Promise<TriggerBuildResponse> {
  return fetchJson("/cloud-builds/trigger", {
    method: "POST",
    body: JSON.stringify({ service, branch }),
  });
}

export async function getCloudBuildHistory(service: string, limit: number = 10): Promise<BuildHistoryResponse> {
  return fetchJson(`/cloud-builds/history/${service}?limit=${limit}`);
}

export interface AwsStatusResponse {
  authenticated: boolean;
  account_id?: string;
  user_arn?: string;
  region?: string;
  error?: string;
}

export async function getAwsStatus(): Promise<AwsStatusResponse> {
  return fetchJson("/cloud-builds/aws-status");
}

// Instrument Search and Availability
export interface InstrumentSearchResult {
  instrument_key: string;
  venue: string;
  instrument_type: string;
  symbol?: string;
  base_currency?: string;
  quote_currency?: string;
  data_types?: string[] | string;
  available_from_datetime?: string;
  available_to_datetime?: string;
}

export interface InstrumentsListResponse {
  asset_group: string;
  aggregated_file?: string;
  aggregated_date?: string;
  total_in_file: number;
  returned_count: number;
  search?: string;
  instruments: InstrumentSearchResult[];
  error?: string;
}

export interface InstrumentAvailabilityResponse {
  instrument_key: string;
  parsed: {
    venue: string;
    instrument_type: string;
    symbol: string;
    asset_group: string;
    folder: string;
  };
  service: string;
  bucket: string;
  date_range: {
    start: string;
    end: string;
    total_dates: number;
    first_day_of_month_only: boolean;
  };
  availability_window?: {
    instrument_from?: string;
    instrument_to?: string;
    effective_start: string;
    effective_end: string;
    dates_in_window: number;
  };
  data_types_checked: string[];
  overall: {
    expected: number;
    found: number;
    missing: number;
    completion_pct: number;
  };
  by_data_type: Record<
    string,
    {
      dates_found: number;
      dates_missing: number;
      completion_pct: number;
      dates_found_list: string[];
      dates_missing_list: string[];
    }
  >;
  timeframe?: string;
  error?: string;
}

export async function getInstrumentsList(params: {
  asset_group: string;
  search?: string;
  limit?: number;
}): Promise<InstrumentsListResponse> {
  const searchParams = new URLSearchParams();
  searchParams.set("asset_group", params.asset_group);
  if (params.search) searchParams.set("search", params.search);
  if (params.limit) searchParams.set("limit", params.limit.toString());
  const raw = await fetchJson<unknown>(`/data-status/instruments?${searchParams.toString()}`);
  if (raw && typeof raw === "object" && !Array.isArray(raw)) {
    const r = raw as Record<string, unknown>;
    if ("category" in r && !("asset_group" in r)) {
      const { category, ...rest } = r;
      return {
        ...rest,
        asset_group: category ?? "",
      } as InstrumentsListResponse;
    }
  }
  return raw as InstrumentsListResponse;
}

/**
 * Cross-asset-group canonical-symbol search — backed by
 * ``/api/data-status/instruments/search``. Walks one or all five asset groups
 * (cefi/tradfi/defi/sports/prediction) and returns canonical IDs whose
 * substrings (whitespace-tokenised, AND-matched) contain the query.
 *
 * Sports returns ``league_id`` matches (EPL, BUNDESLIGA, …); other asset groups
 * return ``instrument_key`` matches like ``BINANCE-FUTURES:PERPETUAL:BTC-USDT``.
 */
export interface InstrumentSearchMatch {
  canonical_id: string;
  asset_group: string;
  venue: string;
  instrument_type: string;
}

export interface InstrumentSearchResponse {
  query: string;
  asset_group: string | null;
  matches: InstrumentSearchMatch[];
  total_matches: number;
  truncated: boolean;
  asset_groups_searched: string[];
}

export async function searchInstruments(params: {
  query: string;
  asset_group?: string;
  limit?: number;
}): Promise<InstrumentSearchResponse> {
  const qp = new URLSearchParams();
  qp.set("query", params.query);
  if (params.asset_group) qp.set("asset_group", params.asset_group);
  if (params.limit !== undefined) qp.set("limit", params.limit.toString());
  return fetchJson<InstrumentSearchResponse>(`/data-status/instruments/search?${qp.toString()}`);
}

/**
 * Per-pool DeFi drilldown — backed by ``/api/data-status/pools/breakdown``.
 * Chain-native equivalent of the sports per-fixture breakdown. Returns one
 * row per pool ID surfaced under the (day, venue, chain) shard with a
 * coverage map showing which data_types captured each pool.
 */
export type PoolCoverageState = "captured" | "empty_confirmed" | "missing" | "failed";

export interface PoolCoverageRow {
  pool_id: string;
  coverage: Record<string, PoolCoverageState>;
  coverage_summary: {
    captured: number;
    empty_confirmed: number;
    missing: number;
    failed: number;
  };
}

export interface PoolBreakdownResponse {
  day: string;
  venue: string;
  chain: string;
  venue_chain: string;
  data_types_expected: string[];
  pools_expected: number;
  pools: PoolCoverageRow[];
  status: "resolved" | "no_data";
}

export async function getPoolBreakdown(params: {
  day: string;
  venue: string;
  chain: string;
}): Promise<PoolBreakdownResponse> {
  const qp = new URLSearchParams();
  qp.set("day", params.day);
  qp.set("venue", params.venue);
  qp.set("chain", params.chain);
  return fetchJson<PoolBreakdownResponse>(`/data-status/pools/breakdown?${qp.toString()}`);
}

export async function getInstrumentAvailability(params: {
  instrument_key: string;
  start_date: string;
  end_date: string;
  data_type?: string;
  first_day_of_month_only?: boolean;
  service?: string;
  timeframe?: string;
  available_from?: string;
  available_to?: string;
}): Promise<InstrumentAvailabilityResponse> {
  const searchParams = new URLSearchParams();
  searchParams.set("instrument_key", params.instrument_key);
  searchParams.set("start_date", params.start_date);
  searchParams.set("end_date", params.end_date);
  if (params.data_type) searchParams.set("data_type", params.data_type);
  if (params.first_day_of_month_only) searchParams.set("first_day_of_month_only", "true");
  if (params.service) searchParams.set("service", params.service);
  if (params.timeframe) searchParams.set("timeframe", params.timeframe);
  if (params.available_from) searchParams.set("available_from", params.available_from);
  if (params.available_to) searchParams.set("available_to", params.available_to);
  const raw = await fetchJson<
    InstrumentAvailabilityResponse & {
      parsed?: InstrumentAvailabilityResponse["parsed"] & { category?: string };
    }
  >(`/data-status/instrument-availability?${searchParams.toString()}`);
  if (raw?.parsed && "category" in raw.parsed && !("asset_group" in raw.parsed)) {
    const p = raw.parsed as Record<string, unknown>;
    const cat = p["category"];
    const { category: _category, ...rest } = p;
    return {
      ...raw,
      parsed: {
        ...rest,
        asset_group: typeof cat === "string" ? cat : String(cat ?? ""),
      } as InstrumentAvailabilityResponse["parsed"],
    };
  }
  return raw;
}

// ── Event stream ─────────────────────────────────────────────────────────────

/**
 * Return the full shard event stream for a deployment.
 * Each event captures a lifecycle step (JOB_STARTED, VM_PREEMPTED, etc.)
 * with timestamp, message, and optional metadata.
 */
export async function getDeploymentEvents(deploymentId: string, shardId?: string): Promise<DeploymentEventStream> {
  const params = new URLSearchParams();
  if (shardId) params.set("shard_id", shardId);
  const query = params.toString();
  return fetchJson(`/deployments/${deploymentId}/events${query ? `?${query}` : ""}`);
}

/**
 * Return VM-level infrastructure events for a deployment.
 * Filters to: VM_PREEMPTED, VM_DELETED, VM_QUOTA_EXHAUSTED, VM_ZONE_UNAVAILABLE,
 * VM_TIMEOUT, CONTAINER_OOM, CLOUD_RUN_REVISION_FAILED.
 */
export async function getDeploymentVmEvents(deploymentId: string): Promise<DeploymentEventStream> {
  return fetchJson(`/deployments/${deploymentId}/vm-events`);
}

// ── Live deployment ───────────────────────────────────────────────────────────

/**
 * Roll back a live Cloud Run Service to the previous (or specified) revision.
 * Only valid for deployments with deploy_mode="live".
 */
export async function rollbackLiveDeployment(
  deploymentId: string,
  request: RollbackRequest,
): Promise<RollbackResponse> {
  return fetchJson(`/deployments/${deploymentId}/rollback`, {
    method: "POST",
    body: JSON.stringify(request),
  });
}

/**
 * Return the current health check status of a live Cloud Run Service.
 * Used by DeploymentDetails to show a live health badge.
 */
export async function getLiveDeploymentHealth(
  deploymentId: string,
  service: string,
  region: string,
): Promise<LiveHealthStatus> {
  const params = new URLSearchParams({ service, region });
  return fetchJson(`/deployments/${deploymentId}/live-health?${params.toString()}`);
}

// ---------------------------------------------------------------------------
// v7 — Chaos injections (Phase 4b)
// ---------------------------------------------------------------------------
// NOTE: client subscriptions (SLA tier / isolation) moved to unified-trading-system-ui
// (`services/manage/subscriptions`) per the dual-cut cleanup 2026-06-12. The
// deployment-api `/subscriptions` backend is unchanged.

import type { ChaosInjectionSpec, RuntimeProfile } from "../types";

export async function listActiveChaosInjections(runtimeProfile?: RuntimeProfile): Promise<ChaosInjectionSpec[]> {
  const qs = runtimeProfile ? `?runtime_profile=${encodeURIComponent(runtimeProfile)}` : "";
  // The backend returns `{injections: [...]}`; tolerate a bare array too (defensive) so the
  // cockpit Chaos tab never crashes on `injections.map` when the real shape is the envelope.
  const data = await fetchJson<{ injections?: ChaosInjectionSpec[] } | ChaosInjectionSpec[]>(`/chaos/injections/${qs}`);
  return Array.isArray(data) ? data : (data.injections ?? []);
}

export async function createChaosInjection(spec: ChaosInjectionSpec): Promise<ChaosInjectionSpec> {
  return fetchJson<ChaosInjectionSpec>("/chaos/injections/", {
    method: "POST",
    body: JSON.stringify(spec),
  });
}

export async function deleteChaosInjection(injectionId: string): Promise<void> {
  await fetchJson<void>(`/chaos/injections/${encodeURIComponent(injectionId)}`, {
    method: "DELETE",
  });
}

/** Per-capture-status counts for one shard population. */
export interface HonestCoverageStatusCounts {
  captured: number;
  empty_confirmed: number;
  attempted_failed: number;
  /**
   * Split known-empty / pending-fetch buckets. The instruments-service
   * `measure_honest_coverage.py` cron emits a SINGLE collapsed
   * `expected_unattempted` field (see below) — these split fields are absent
   * on that payload, so they are optional. The card derives the split when
   * only the collapsed field is present.
   */
  expected_unattempted_known_empty?: number;
  expected_unattempted_pending_fetch?: number;
  /**
   * Collapsed expected-but-never-fetched bucket as actually emitted by the
   * cron (`{captured, empty_confirmed, attempted_failed, expected_unattempted,
   * total, coverage_pct, all_shards_coverage_pct}`). When present it is the
   * authoritative pending-fetch count; the `_known_empty`/`_pending_fetch`
   * split fields above are NOT emitted by the cron.
   */
  expected_unattempted?: number;
  total: number;
  /** Never-collectable cells excluded from the denominator (pre-genesis / delisted / etc.). */
  out_of_window?: number;
  /**
   * CRON-EMITTED `coverage_pct` is captured-ONLY: `captured / (captured +
   * attempted_failed + expected_unattempted)` — it EXCLUDES `empty_confirmed`
   * from the numerator. For an asset_group with a vast legitimately-empty
   * universe (e.g. CeFi per-minute liquidations/book snapshots) this collapses
   * to a tiny figure (~11.7%) that disagrees wildly with the TURBO "Data
   * Coverage" widget (~98.5% — which counts empty_confirmed as covered). The
   * card therefore does NOT display this field as a headline; it recomputes the
   * manifest-capture + captured ratios from the raw counts so both widgets
   * agree. Kept here only for provenance / debugging.
   */
  coverage_pct: number;
  /** Legacy all-shards formula including empty_confirmed in denominator. */
  all_shards_coverage_pct?: number;
  /**
   * Shards-weighted could-exist ratio: captured / full UAC-declared universe (shards_expected).
   * This is the OPERATOR-CHOSEN canonical metric — "coverage (of could-exist)".
   * Typically much lower than coverage_pct (~27% vs ~97%) because it counts uncollected
   * shards from the full declared universe, not just the attempted subset.
   */
  completion_pct_shards_weighted?: number;
  /** Date-axis could-exist coverage (captured_dates / could_exist_dates). */
  completion_pct_dates?: number;
  /** Blended attempt-weighted could-exist coverage. */
  completion_pct_attempt_blended?: number;
  /** Total shards found (captured) across the UAC universe. */
  shards_found?: number;
  /** Total shards expected across the full UAC-declared universe. */
  shards_expected?: number;
}

/** Top-level shape of gs://central-element-323112-honest-coverage/{date}/coverage.json */
export interface HonestCoverageResponse {
  generated_at: string;
  date: string;
  by_asset_group: Record<string, HonestCoverageStatusCounts>;
  by_venue: Record<string, Record<string, HonestCoverageStatusCounts>>;
  by_venue_data_type: Record<string, Record<string, Record<string, HonestCoverageStatusCounts>>>;
}

/** Fetch cross-asset-group honest coverage for a given date (default: today UTC).
 * Returns null when the API responds 404 (cron VM hasn't run yet). */
export async function getHonestCoverage(date?: string): Promise<HonestCoverageResponse | null> {
  const qs = date ? `?date=${encodeURIComponent(date)}` : "";
  try {
    return await fetchJson<HonestCoverageResponse>(`/data-status/honest-coverage${qs}`);
  } catch (err) {
    if (err instanceof ApiClientError && err.status === 404) return null;
    throw err;
  }
}

// ===========================================================================
// Recursive-borrow coverage — Phase 11 of defi_recursive_borrow_archetypes.
// ===========================================================================

export type CellStatus = "design-ready" | "coverage-ready" | "live-ready" | "paused";

export interface RecursiveBorrowCell {
  protocol: string;
  chain: string;
  collateral_asset: string;
  debt_asset: string;
  family: "lending-only" | "perp-hedged";
  perp_venue: string | null;
  lending_rate_coverage_pct: number;
  funding_rate_coverage_pct: number;
  spread_history_horizon_days: number;
  last_observed_at: string | null;
  cell_status: CellStatus;
}

export interface RecursiveBorrowCoverageResponse {
  generated_at: string;
  cache_ttl_seconds: number;
  cells: RecursiveBorrowCell[];
  summary: {
    total_cells: number;
    coverage_ready: number;
    live_ready: number;
    avg_lending_rate_coverage_pct: number;
  };
}

export async function getRecursiveBorrowCoverage(): Promise<RecursiveBorrowCoverageResponse> {
  return fetchJson<RecursiveBorrowCoverageResponse>("/data-status/recursive-borrow-coverage");
}

// ===========================================================================
// Venue × Year coverage — deployment_ui_vm_and_venue_coverage_visibility.
// ===========================================================================

export interface VenueYearRow {
  venue: string;
  asset_group: string;
  year: number;
  captured: number;
  empty_confirmed: number;
  expected_unattempted: number;
  pending_paid_key: number;
  attempted_failed: number;
  total: number;
}

export interface VenueYearCoverageResponse {
  rows: VenueYearRow[];
  asset_groups_loaded: string[];
  asset_groups_failed: string[];
}

export type CoverageScope = "could_exist" | "mvp" | "all";

export async function getVenueYearCoverage(
  assetGroups: string[],
  scope: CoverageScope = "could_exist",
): Promise<VenueYearCoverageResponse> {
  const params = new URLSearchParams();
  params.set("asset_groups", assetGroups.join(","));
  params.set("scope", scope);
  return fetchJson<VenueYearCoverageResponse>(`/data-status/venue-year-coverage?${params.toString()}`);
}

// ---------------------------------------------------------------------------
// Repo-CI dashboard (plan: ci_dashboard_deployment_ui_2026_06_10.md)
// Mirrors deployment-api routes/_repo_ci_types.py — keep the two in lockstep.
// ---------------------------------------------------------------------------

export type StuckClass = "conflicting" | "skip_ci_jammed" | "v2_never_reported" | "failing_check" | "automerge_stuck";

export interface RepoCiBranchHead {
  branch: string;
  sha: string | null;
  committed_at: string | null;
}

export interface RepoCiBranchDelta {
  base: string;
  head: string;
  ahead_by: number;
  behind_by: number;
  files_changed: number;
}

export interface RepoCiCommit {
  sha: string;
  message: string;
  author: string;
  committed_at: string | null;
  v2_conclusion: string | null;
}

export interface RepoCiBlockingCheck {
  name: string; // the required check / status context, e.g. "AWS CodeBuild ap-northeast-1 (deployment-service)"
  state: string; // failure | error | pending
  description: string; // GitHub's reason string, e.g. "Pull request approval required for starting a build"
}

export interface RepoCiPr {
  repo: string;
  number: number;
  title?: string;
  base?: string;
  head?: string;
  url?: string;
  age_min?: number;
  auto_merge?: boolean;
  merge_state?: string;
  failed_check?: boolean;
  v2_present?: boolean;
  stuck_class?: StuckClass | null;
  // Non-success required checks blocking the merge (classic status contexts like AWS
  // CodeBuild) — the on-screen "why is this stuck" so the operator doesn't have to dig.
  blocking_checks?: RepoCiBlockingCheck[];
}

export interface RepoCiSitState {
  in_breaking_pending: boolean;
  staging_locked: boolean;
  staging_locked_reason: string | null;
  last_sit_run_status: string | null;
  last_sit_run_age_min: number | null;
  stuck_in_sit: boolean;
}

export interface RepoCiSitJob {
  name: string;
  status: string;
  conclusion: string | null;
}

export interface RepoCiSitLastRun {
  url: string;
  status: string;
  conclusion: string | null;
  age_min: number | null;
  jobs: RepoCiSitJob[];
}

export interface RepoCiImageSignal {
  last_build_status: string | null;
  last_build_sha: string | null;
  /** ISO-8601 of the last build's finish_time (B1 — when the image last built). */
  last_build_time?: string | null;
  /** GCP Cloud Build / AWS CodeBuild console URL for the last build (B1 — click-through). */
  last_build_log_url?: string | null;
  /** Last SUCCESSFUL build — so a red latest build doesn't hide the last good image
   * ("current build failed, what's the last sha that succeeded?"). Null = no success in window. */
  last_success_sha?: string | null;
  last_success_time?: string | null;
  last_success_log_url?: string | null;
  deployed_version: string | null;
  image_stale: boolean | null;
}

export interface RepoCiOverviewRow {
  repo: string;
  repo_type: string;
  ci_status: string;
  /** Per-branch quality-gates-v2 conclusion (keyed by branch name; value success/failure/in_progress/… or null
   * when v2 never ran). Lets the UI annotate WHICH branch is red — ci_status alone can't distinguish
   * "main red, LDR recovered" from "LDR actively broken". */
  branch_ci?: Record<string, string | null>;
  branches: RepoCiBranchHead[];
  deltas: RepoCiBranchDelta[];
  open_prs: RepoCiPr[];
  sit: RepoCiSitState;
  image: RepoCiImageSignal;
  /** Dual-cloud image status (side-by-side, no provider toggle) — per-cloud build signal. Null/absent
   * when that cloud's build API isn't reachable. `image` is the active provider's (deployed_version). */
  image_gcp?: RepoCiImageSignal | null;
  image_aws?: RepoCiImageSignal | null;
  /** N2: most-recent GREEN main sha + time ("green as of <sha> · <age>"), distinct from the head
   * (which may be red/pending). Null when no successful v2 run is known for the repo's main. */
  last_green_main?: RepoCiLastGreen | null;
  /** G6: age (minutes) of the oldest DIVERGED FILE's last LDR change — the true promotion lag
   * (>60min pages). Files-based, not the commit graph. Null when LDR is in sync with main. */
  main_lag_age_min?: number | null;
  /** Real (squash-free) count of commits carrying the LDR→main content delta — distinct
   * last-setting commits of the diverged files. Null when in sync. Use this, NOT ahead_by. */
  main_unpromoted_commits?: number | null;
  /** promotion-drain follow-up: true when this repo has real file-content ahead of staging/main
   * AND the corresponding global drain leg is failing/stale (the bug-#11 class — content piling
   * on LDR with a dead drain). */
  drain_stalled?: boolean;
  /** Dependency layer from the manifest (e.g. "0"/"1"/"service") — the promotion tier. */
  tier?: string;
  /** Deps NOT yet on main that hold THIS repo's staging→main promotion (dep-order). Empty/absent
   * = clear. Non-empty ⟺ this repo is HELD waiting for a dependency to reach main. */
  blocked_by?: RepoCiDepBlocker[];
  /** Repos held because THIS repo isn't on main yet (inverse of blocked_by). Non-empty ⟺ this repo
   * is a promotion blocker for others. */
  blocking?: string[];
  /** Codebase-health metrics derived from the most-recent QG run on the repo's main branch.
   * Absent for tool repos or when CI hasn't emitted the data yet. */
  codebase_health?: {
    /** Test-coverage % from the last green QG run (0–100). Null = not yet reported. */
    coverage_pct: number | null;
    /** Label of the first QG step that failed — e.g. "pytest", "basedpyright", "ruff", "bandit".
     * Null = QG passed (or hasn't run). */
    qg_red_reason: string | null;
    /** Files whose line-count ≥ 900 (hard limit). */
    large_file_count: number | null;
    /** Files in the 700–899 warn zone. */
    warn_file_count: number | null;
  } | null;
}

export interface RepoCiLastGreen {
  sha: string;
  at: string;
}

export interface RepoCiError {
  repo: string;
  error: string;
}

export interface RepoCiPromotionBlocked {
  repo: string;
  /** consecutive staging→main promotion failures (manifest promotion_failures[repo]). */
  failures: number;
  /** true when the repo is parked in promotion_quarantine (vs. failing-but-not-yet-quarantined). */
  quarantined: boolean;
  since?: string;
  attempts?: number;
  escalated?: boolean;
}

/** A dependency not yet on main that holds a repo's staging→main promotion (dep-order). */
export interface RepoCiDepBlocker {
  name: string;
  tier: string;
  ci_status: string;
}

/** A not-on-main repo holding ≥1 other repo from main — the cause of the dep-order hold. */
export interface RepoCiRootBlocker {
  repo: string;
  tier: string;
  ci_status: string;
  /** how many repos are held waiting on this one. */
  blocking_count: number;
  /** this repo's own staging-ahead-of-main file delta (the content stuck below main). */
  main_files_behind: number;
}

/** Aggregate for the "Promotion held — dependency order" card + the stalled banner — dep-order
 * HOLDS (a clean wait), distinct from promotion_blocked (failure-quarantine). */
export interface RepoCiPromotionHeld {
  /** repos currently held by dependency-order (waiting on a dep to reach main). */
  held_repos: string[];
  /** the not-on-main repos causing the holds, lowest tier (most foundational) first. */
  root_blockers: RepoCiRootBlocker[];
}

export interface RepoCiOverview {
  generated_at: string;
  source: string;
  repos: RepoCiOverviewRow[];
  stuck_prs: RepoCiPr[];
  stuck_in_sit: string[];
  sit_last_run: RepoCiSitLastRun | null;
  errors?: RepoCiError[];
  /** Repos parked out of the staging→main promotion (G1 — alert-parity for the
   * staging-to-main genuine-failure CRITICAL page + newly-quarantined WARNING). */
  promotion_blocked?: RepoCiPromotionBlocked[];
  /** Routine LDR→staging / LDR→main promote drain (PM-central, every 15 min) — distinct from the
   * breaking cascade/SIT (sit_last_run). Null when the drain runs can't be fetched. */
  promotion_drain?: RepoCiPromotionDrain | null;
  /** Semver-agent standing health (G2) — last bump run + pending-bump count + breaker-armed flag.
   * Null when the semver-agent run can't be fetched. */
  semver_health?: RepoCiSemverHealth | null;
  /** Dependency-order promotion HOLDS (a clean wait), distinct from promotion_blocked
   * (failure-quarantine). Drives the "Promotion held — dependency order" card + the stalled
   * banner. Null/absent when not computed. */
  promotion_held?: RepoCiPromotionHeld | null;
}

export interface RepoCiSemverHealth {
  last_run_status: string;
  last_run_conclusion: string | null;
  last_run_age_min: number | null;
  last_run_url: string;
  /** Repos whose staging version is ahead of main (pending promotion) — the breaker counts these. */
  pending_bump_count: number;
  pending_bump_repos: string[];
  /** True when pending_bump_count >= breaker_threshold (the semver-agent circuit-breaker condition). */
  breaker_armed: boolean;
  breaker_threshold: number;
}

export interface RepoCiPromoteRun {
  status: string;
  conclusion: string | null;
  age_min: number | null;
  url: string;
}

export interface RepoCiPromotionDrain {
  ldr_to_staging: RepoCiPromoteRun | null;
  ldr_to_main: RepoCiPromoteRun | null;
}

export interface RepoCiBranchCommits {
  branch: string;
  commits: RepoCiCommit[];
}

export interface RepoCiDetail {
  repo: string;
  repo_type: string;
  ci_status: string;
  generated_at: string;
  source: string;
  branches: RepoCiBranchHead[];
  deltas: RepoCiBranchDelta[];
  history: RepoCiBranchCommits[];
  open_prs: RepoCiPr[];
  sit: RepoCiSitState;
  image: RepoCiImageSignal;
  /** N2-followup: per-branch last-green (keyed by branch name) — the most-recent SHA on each of
   * LDR / staging / main whose quality-gates-v2 concluded success, or null when none. */
  last_green?: Record<string, RepoCiLastGreen | null>;
}

/** Cloud whose build status the repo-CI Image column reads (the GCP/AWS toggle). Under Option B a
 * single backend serves both clouds via this query param (?provider=) — no per-cloud base-URL swap. */
export type RepoCiProvider = "gcp" | "aws";

function repoCiProviderQuery(provider?: RepoCiProvider): string {
  return provider ? `?provider=${provider}` : "";
}

export async function getRepoCiOverview(provider?: RepoCiProvider): Promise<RepoCiOverview> {
  return fetchJson<RepoCiOverview>(`/repo-ci/overview${repoCiProviderQuery(provider)}`);
}

export async function getRepoCiDetail(repo: string, provider?: RepoCiProvider): Promise<RepoCiDetail> {
  return fetchJson<RepoCiDetail>(`/repo-ci/${repo}/detail${repoCiProviderQuery(provider)}`);
}

export interface RepoCiAlertEntry {
  kind: string;
  timestamp: string;
  repo: string;
  workflow_name: string;
  severity: string | null;
  conclusion: string | null;
  message: string | null;
  run_url: string | null;
}

export interface RepoCiAlertStream {
  repo: string;
  workflow_name: string;
  current: RepoCiAlertEntry;
  previous: RepoCiAlertEntry | null;
  count: number;
}

export interface RepoCiAlerts {
  generated_at: string;
  source: string;
  alerts: RepoCiAlertEntry[];
  streams: RepoCiAlertStream[];
}

export async function getRepoCiAlerts(): Promise<RepoCiAlerts> {
  return fetchJson<RepoCiAlerts>("/repo-ci/alerts");
}

// --- Unified alert ledger — GET /api/alerts (all alert classes, not just CI/CD) ------
// Shape matches RepoCiAlerts; `kind` is the alert class discriminator.
// Currently: "alert" | "event" (CI/CD only). INFRA P1 adds non-CI kinds:
// "vm_down" | "consolidator_down" | "git_health" | "worker_liveness" | "data_pipeline".
// Consumed by the /alerts page (deployment_ui_monitoring_pane_2026_06_19.md).

export type UnifiedAlertEntry = RepoCiAlertEntry;
export type UnifiedAlertStream = RepoCiAlertStream;
export type UnifiedAlerts = RepoCiAlerts;

export async function getUnifiedAlerts(): Promise<UnifiedAlerts> {
  return fetchJson<UnifiedAlerts>("/alerts");
}

// --- Fleet git-health (proxied from agent-orchestrator; operator decision v2) -------

export interface FleetGitRepoHealth {
  name: string;
  state: string;
  dirty_files: number;
  ahead: number;
  behind: number;
  local_sha: string;
  not_clean_since: string | null;
  unpushed_plans: string[];
  drift_violation: boolean;
}

export interface FleetGitSlotHealth {
  slot_id: number;
  host: string | null;
  reported_at: string | null;
  reporter_stale: boolean;
  ff_pull_last_run: string | null;
  ff_pull_last_result: string | null;
  ff_cron_stale: boolean;
  repos: FleetGitRepoHealth[];
}

export interface FleetGitHostHealth {
  host: string;
  vm_id: string | null;
  slots: FleetGitSlotHealth[];
}

export interface FleetGitSummary {
  hosts: number;
  slots: number;
  repos_total: number;
  dirty: number;
  behind: number;
  ahead: number;
  diverged: number;
  clean: number;
  drift_violations: number;
  reporter_stale_slots: number;
  ff_cron_stale_slots: number;
}

export interface FleetGitData {
  generated_at: string;
  scope: string;
  summary: FleetGitSummary;
  hosts: FleetGitHostHealth[];
  drift_violations: Array<Record<string, string>>;
  vm_errors: Array<Record<string, string>>;
}

export interface FleetGitHealthProxy {
  available: boolean;
  reason: string;
  orchestrator_url: string;
  data: FleetGitData | null;
}

export async function getFleetGitHealth(): Promise<FleetGitHealthProxy> {
  return fetchJson<FleetGitHealthProxy>("/repo-ci/fleet-git-health");
}

// VM Census — vm_zombie_watchdog.py running/expected/zombie/OOM surface
// Served by deployment-api GET /api/fleet/vm-census (INFRA P1 — backend pending)
export type VmLifecycleClass = "EPHEMERAL_BATCH" | "EPHEMERAL_EXPERIMENT" | "SCHEDULED_RECURRING" | "LONG_LIVED_LIVE";
export type VmRunStatus = "RUNNING" | "STOPPING" | "STOPPED" | "TERMINATED";

export interface VmCensusEntry {
  name: string;
  prefix: string;
  lifecycle_class: VmLifecycleClass;
  status: VmRunStatus;
  zombie: boolean;
  oom: boolean;
  age_min: number | null;
  zone: string;
}

export interface VmCensusResponse {
  generated_at: string;
  running: number;
  expected: number;
  zombie: number;
  oom: number;
  stopped: number;
  vms: VmCensusEntry[];
}

// Infra VM Health — AO /api/fleet/summary proxy
// Served by deployment-api GET /api/fleet/infra-vm-health (INFRA P1 — backend pending)
export interface InfraVmAlert {
  severity: "info" | "warn" | "crit";
  kind: string;
  detail: string;
}

export interface InfraVmWatchdog {
  enabled: boolean;
  kills_today: number;
  daily_cap: number;
  dormant: boolean;
  flapping: boolean;
}

export interface InfraVmSummary {
  vm_id: string;
  role: "epic" | "planning" | "unknown";
  label: string | null;
  slots_total: number;
  slots_working: number;
  slots_idle: number;
  slots_stale: number;
  slots_paused: number;
  slots_blocked: number;
  backlog_total: number;
  backlog_queued: number;
  alerts: InfraVmAlert[];
  watchdog: InfraVmWatchdog | null;
}

export interface InfraVmSlot {
  id: string;
  label: string;
  url: string;
  available: boolean;
  error: string | null;
  stale: boolean;
  last_heartbeat_seconds_ago: number | null;
  summary: InfraVmSummary | null;
}

export interface InfraVmHealthResponse {
  available: boolean;
  orchestrator_url: string;
  vms: InfraVmSlot[];
}

export async function getVmCensus(): Promise<VmCensusResponse> {
  return fetchJson<VmCensusResponse>("/fleet/vm-census");
}

export async function getInfraVmHealth(): Promise<InfraVmHealthResponse> {
  return fetchJson<InfraVmHealthResponse>("/fleet/infra-vm-health");
}

export { ApiError };
