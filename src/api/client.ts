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

function createClientConfig(
  baseUrl: string,
  options?: ApiClientOptions,
): { baseUrl: string; timeoutMs: number } {
  return { baseUrl, timeoutMs: options?.timeoutMs ?? 30_000 };
}

function createApiClient(config: {
  baseUrl: string;
  timeoutMs: number;
}): ApiClient {
  async function request<T>(
    method: string,
    url: string,
    body?: unknown,
    opts?: RequestInit,
  ): Promise<T> {
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
        const error = await response
          .json()
          .catch(() => ({ detail: "Unknown error" }));
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
    get: <T>(url: string, opts?: RequestInit) =>
      request<T>("GET", url, undefined, opts),
    post: <T>(url: string, body?: unknown, opts?: RequestInit) =>
      request<T>("POST", url, body, opts),
    put: <T>(url: string, body?: unknown, opts?: RequestInit) =>
      request<T>("PUT", url, body, opts),
    delete: <T>(url: string, opts?: RequestInit) =>
      request<T>("DELETE", url, undefined, opts),
  };
}

// ---------------------------------------------------------------------------

import type {
  CategoryVenuesResponse,
  ChecklistResponse,
  ChecklistSummary,
  ChecklistValidateResponse,
  CreateDeploymentResponse,
  DataStatusResponse,
  DependenciesResponse,
  Deployment,
  DeploymentEventStream,
  DeploymentRequest,
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
async function fetchJsonDirect<T>(
  url: string,
  options?: RequestInit,
): Promise<T> {
  const response = await fetch(`${API_BASE}${url}`, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json",
      ...options?.headers,
    },
  });

  if (!response.ok) {
    const error = await response
      .json()
      .catch(() => ({ detail: "Unknown error" }));
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

export async function getServiceDimensions(
  serviceName: string,
): Promise<ServiceDimensionsResponse> {
  return fetchJson(`/services/${serviceName}/dimensions`);
}

export async function discoverConfigs(
  serviceName: string,
  cloudPath: string,
): Promise<DiscoverConfigsResponse> {
  const params = new URLSearchParams();
  params.set("cloud_path", cloudPath);
  return fetchJson(
    `/services/${serviceName}/discover-configs?${params.toString()}`,
  );
}

export interface ListDirectoriesResponse {
  service: string;
  cloud_path: string;
  directories: string[];
  count: number;
}

export async function listDirectories(
  serviceName: string,
  cloudPath: string,
): Promise<ListDirectoriesResponse> {
  const params = new URLSearchParams();
  params.set("cloud_path", cloudPath);
  return fetchJson(
    `/services/${serviceName}/list-directories?${params.toString()}`,
  );
}

export interface ConfigBucketsResponse {
  service: string;
  default_bucket: string | null;
  buckets: Array<{ name: string; path: string }>;
  message?: string;
}

export async function getConfigBuckets(
  serviceName: string,
): Promise<ConfigBucketsResponse> {
  return fetchJson(`/services/${serviceName}/config-buckets`);
}

// Config
export async function getVenues(): Promise<VenuesResponse> {
  return fetchJson("/config/venues");
}

export async function getVenuesByCategory(
  category: string,
): Promise<CategoryVenuesResponse> {
  return fetchJson(`/config/venues/${category}`);
}

export async function getStartDates(
  serviceName: string,
): Promise<StartDatesResponse> {
  return fetchJson(`/config/expected-start-dates/${serviceName}`);
}

export async function getDependencies(
  serviceName: string,
): Promise<DependenciesResponse> {
  return fetchJson(`/config/dependencies/${serviceName}`);
}

// Deployments
export async function getDeployments(filters?: {
  service?: string;
  status?: string;
  category?: string;
  limit?: number;
  forceRefresh?: boolean;
}): Promise<{ deployments: Deployment[]; count: number }> {
  const params = new URLSearchParams();
  if (filters?.service) params.set("service", filters.service);
  if (filters?.status) params.set("status", filters.status);
  if (filters?.category) params.set("category", filters.category);
  if (filters?.limit) params.set("limit", filters.limit.toString());
  if (filters?.forceRefresh) params.set("force_refresh", "true");

  const query = params.toString();
  return fetchJson(`/deployments${query ? `?${query}` : ""}`);
}

export async function getDeployment(id: string): Promise<Deployment> {
  return fetchJson(`/deployments/${id}`);
}

export async function createDeployment(
  request: DeploymentRequest,
): Promise<CreateDeploymentResponse> {
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

export async function getDeploymentQuotaInfo(
  request: DeploymentRequest,
): Promise<QuotaInfoResponse> {
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

export async function cancelDeployment(
  id: string,
): Promise<CancelDeploymentResult> {
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

export async function resumeDeployment(
  id: string,
): Promise<ResumeDeploymentResult> {
  return fetchJson(`/deployments/${id}/resume`, { method: "POST" });
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
  return fetchJson(
    `/deployments/${id}/verify-completion${query ? `?${query}` : ""}`,
    { method: "POST" },
  );
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
  options?: { category?: string; dryRun?: boolean },
): Promise<RetryFailedResult> {
  const params = new URLSearchParams();
  if (options?.category) params.set("category", options.category);
  if (options?.dryRun) params.set("dry_run", "true");
  const query = params.toString();

  // Retry can take 30-60 seconds as it creates VMs — use a dedicated client with 2-minute timeout
  const retryClient = createApiClient(
    createClientConfig(API_BASE, { timeoutMs: 120_000 }),
  );
  return retryClient.post<RetryFailedResult>(
    `/deployments/${id}/retry-failed${query ? `?${query}` : ""}`,
  );
}

// Single Shard Actions
export interface CancelShardResult {
  deployment_id: string;
  shard_id: string;
  status: string;
  message: string;
}

export async function cancelShard(
  deploymentId: string,
  shardId: string,
): Promise<CancelShardResult> {
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

export async function updateDeploymentTag(
  id: string,
  tag: string | null,
): Promise<UpdateDeploymentResult> {
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

export async function bulkDeleteDeployments(
  deploymentIds: string[],
): Promise<BulkDeleteResult> {
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
    category?: string;
    dimensions?: Record<string, unknown>;
  }>;
  infrastructure_issues: Array<{
    shard_id: string;
    zone?: string;
    region?: string;
    reason?: string;
    category?: string;
    attempt?: number;
  }>;
  retry_stats: {
    shards_with_retries: number;
    total_zone_switches: number;
    total_region_switches: number;
  };
}

export async function getDeploymentReport(
  id: string,
): Promise<DeploymentReport> {
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
  return fetchJson(
    `/deployments/${id}/rerun-commands${query ? `?${query}` : ""}`,
  );
}

// Checklists
export async function getChecklist(
  serviceName: string,
): Promise<ChecklistResponse> {
  return fetchJson(`/checklists/${serviceName}/checklist`);
}

export async function validateChecklist(
  serviceName: string,
): Promise<ChecklistValidateResponse> {
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

// Data Status
export async function getDataStatus(params: {
  service: string;
  start_date: string;
  end_date: string;
  mode?: string;
  category?: string[];
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
  if (params.category) {
    params.category.forEach((c) => searchParams.append("category", c));
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
  return fetchJson(`/data-status?${searchParams.toString()}`);
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
  const res = await fetchJson<{ fixtures: UpcomingFixture[]; mock?: boolean }>(
    path,
    { signal: opts?.signal },
  );
  return res.fixtures ?? [];
}

// Turbo Data Status - much faster for large services (uses month-prefix queries)

// Data type completion status (nested within venue)
export interface TurboDataTypeStatus {
  dates_found: number;
  dates_expected: number;
  completion_pct: number;
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
  completion_pct: number;
  unit?: string;
  not_applicable?: boolean;
}

export interface TurboSubDimension {
  dates_found: number;
  dates_expected: number; // Legacy: category-level expected
  dates_missing?: number;
  missing_dates?: string[];
  dates_expected_venue?: number; // NEW: venue-specific expected based on venue start
  dates_expected_category?: number; // NEW: category-level expected for reference
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
}

export interface TurboFeatureGroupStatus {
  dates_found: number;
  dates_expected: number;
  completion_pct: number;
  timeframes?: Record<string, { dates_found: number; dates_expected: number; completion_pct: number }>;
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

export interface TurboCategoryStatus {
  category: string;
  bucket: string;
  prefixes_queried: number;
  dates_expected: number;
  dates_found: number;
  dates_missing: number;
  completion_pct: number;
  // Axis discriminator added 2026-04-20. Controls whether the sub-dimension
  // drilldown lives under `venues` ("venue", legacy default used by CEFI /
  // TRADFI / DEFI / PREDICTION) or under `data_types` ("data_type", used by
  // SPORTS). Consumers MUST branch on this when reading sub-dimensions.
  breakdown_axis?: "venue" | "data_type";
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
  // Sub-dimensions (venue, data_type, feature_group, folder depending on service)
  venues?: { [name: string]: TurboSubDimension };
  data_types?: { [name: string]: TurboSubDimension };
  folders?: { [name: string]: TurboSubDimension }; // Instrument type breakdown
  chains?: { [name: string]: TurboChainStatus }; // DeFi chain breakdown (v4)
  feature_groups?: { [name: string]: TurboFeatureGroupStatus }; // Feature service breakdown (v4)
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
  sub_dimension?: string | null; // 'venue', 'data_type', 'feature_group', or null
  overall_completion_pct: number;
  overall_dates_found: number; // venue-weighted total
  overall_dates_expected: number; // venue-weighted expected
  // Category-level totals for reference (not venue-weighted)
  overall_dates_found_category?: number;
  overall_dates_expected_category?: number;
  total_missing?: number;
  unexpected_missing?: number;
  expected_missing?: number;
  categories: {
    [category: string]: TurboCategoryStatus;
  };
}

export async function getDataStatusTurbo(params: {
  service: string;
  start_date: string;
  end_date: string;
  mode?: "batch" | "live"; // batch vs live GCS paths
  category?: string[];
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
  if (params.category) {
    params.category.forEach((c) => searchParams.append("category", c));
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
 */
export async function getDataStatusManifest(params: {
  service: string;
  start_date: string;
  end_date: string;
  category?: string[];
  signal?: AbortSignal;
}): Promise<TurboDataStatusResponse> {
  const searchParams = new URLSearchParams();
  searchParams.set("service", params.service);
  searchParams.set("start_date", params.start_date);
  searchParams.set("end_date", params.end_date);
  if (params.category) {
    params.category.forEach((c) => searchParams.append("category", c));
  }
  return fetchJson(`/data-status/manifest?${searchParams.toString()}`, {
    signal: params.signal,
  });
}

// Coverage summary — manifest totals + latest-day unique instrument counts
export interface CoverageCategorySummary {
  total_shards: number;
  total_instrument_rows: number;
  unique_dates: number;
  unique_venues: number;
  sub_dimension_label?: string;
  date_range: { start: string; end: string } | null;
  latest_day: string | null;
  latest_day_instruments: Record<string, number>;
  latest_day_total: number;
}

export interface CoverageSummaryResponse {
  service: string;
  categories: Record<string, CoverageCategorySummary>;
  totals: {
    shards: number;
    instrument_rows: number;
    dates_across_categories: number;
    latest_day_instruments: number;
  };
  mock?: boolean;
}

export async function getDataCoverageSummary(params?: {
  service?: string;
  categories?: string;
  signal?: AbortSignal;
}): Promise<CoverageSummaryResponse> {
  const searchParams = new URLSearchParams();
  if (params?.service) searchParams.set("service", params.service);
  if (params?.categories) searchParams.set("categories", params.categories);
  const qs = searchParams.toString();
  return fetchJson(`/data-status/coverage-summary${qs ? `?${qs}` : ""}`, {
    signal: params?.signal,
  });
}

// Get available filters for a specific venue
export interface VenueFiltersResponse {
  category: string;
  venue: string;
  folders: string[];
  data_types: string[];
  instrument_types: string[];
  start_date?: string;
  error?: string;
}

export async function getVenueFilters(
  category: string,
  venue: string,
): Promise<VenueFiltersResponse> {
  const searchParams = new URLSearchParams();
  searchParams.set("category", category);
  searchParams.set("venue", venue);
  return fetchJson(`/data-status/venue-filters?${searchParams.toString()}`);
}

// Venue detail drill-down — reads a parquet file and returns instrument breakdown
export interface VenueDetailResult {
  venue: string;
  category: string;
  date: string;
  total_instruments: number;
  columns: string[];
  instrument_types?: Record<string, number>;
  statuses?: Record<string, number>;
  top_instruments?: Array<{ key: string; type: string; base: string; quote: string }>;
}

export async function fetchVenueDetail(
  service: string,
  category: string,
  venue: string,
  date?: string,
): Promise<VenueDetailResult> {
  const searchParams = new URLSearchParams();
  searchParams.set("service", service);
  searchParams.set("category", category);
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
  category: string;
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
  category: string;
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
  searchParams.set("category", params.category);
  searchParams.set("venue", params.venue);
  searchParams.set("folder", params.folder);
  searchParams.set("data_type", params.data_type);
  searchParams.set("start_date", params.start_date);
  searchParams.set("end_date", params.end_date);
  if (params.timeframe) {
    searchParams.set("timeframe", params.timeframe);
  }
  return fetchJson(`/data-status/list-files?${searchParams.toString()}`, {
    signal: params.signal,
  });
}

// Services that require upstream availability check for accurate missing data
// These services depend on data from upstream services, so we can only count
// "missing" for dates where upstream data actually exists
export const UPSTREAM_CHECK_SERVICES = [
  "market-data-processing-service", // Depends on market-tick-data-handler (raw_tick_data)
  "features-delta-one-service", // Depends on market-data-processing-service (processed_candles)
];

// Services that support turbo mode (GCS/S3 blob listing — L1-L3 dimension-based)
export const TURBO_MODE_SERVICES = [
  "instruments-service",
  "market-tick-data-handler",
  "market-data-processing-service",
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
  "risk-and-exposure-service",
  "pnl-attribution-service",
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
  "risk-and-exposure-service": "client_id",
  "pnl-attribution-service": "strategy_id",
  "alerting-service": "alert_type",
};

// Venue Check Response type (when check_venues=true)
export interface VenueCheckResponse {
  service: string;
  start_date: string;
  end_date: string;
  categories: {
    [category: string]: {
      dates_with_missing_venues: Array<{
        date: string;
        missing: string[];
        file_exists: boolean;
      }>;
      total_dates: number;
    };
  };
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
    };
  };
}

export async function getMissingShards(params: {
  service: string;
  start_date: string;
  end_date: string;
  mode?: string;
  category?: string[];
  venue?: string[];
}): Promise<MissingShardsResponse> {
  const searchParams = new URLSearchParams();
  searchParams.set("service", params.service);
  searchParams.set("start_date", params.start_date);
  searchParams.set("end_date", params.end_date);
  if (params.mode) {
    searchParams.set("mode", params.mode);
  }
  if (params.category) {
    params.category.forEach((c) => searchParams.append("category", c));
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
  return fetchJson(
    `/service-status/execution-services/data-status?${searchParams.toString()}`,
  );
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
  return fetchJson(
    `/service-status/execution-services/missing-shards?${searchParams.toString()}`,
    {
      method: "POST",
    },
  );
}

// Service Status (Temporal Audit Trail)
export async function getServiceStatus(
  serviceName: string,
): Promise<ServiceStatus> {
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

export interface ServiceCategoriesResponse {
  service: string;
  categories: string[];
}

export async function getServiceCategories(
  serviceName: string,
): Promise<ServiceCategoriesResponse> {
  return fetchJson(`/capabilities/service-categories/${serviceName}`);
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
  category: string;
  instrument_type: string;
  data_type: string;
  venue: string | null;
  symbol_column: string | null;
  source: string;
  columns: SchemaColumnSpec[];
  required_row_count_min?: number;
  message?: string;
}

export async function fetchShardSchema(params: {
  service: string;
  category: string;
  instrument_type: string;
  data_type: string;
  venue?: string;
}): Promise<ShardSchemaResponse> {
  const qp = new URLSearchParams({
    service: params.service,
    category: params.category,
    instrument_type: params.instrument_type,
    data_type: params.data_type,
  });
  if (params.venue) qp.set("venue", params.venue);
  return fetchJson<ShardSchemaResponse>(`/data-status/schema?${qp.toString()}`);
}

// ---------------------------------------------------------------------------
// ShardDetail / VenueDetail v2 — unified shard drilldown contract.
// Upstream: deployment-api types/shard_detail.py (commit 9d93236).
// ---------------------------------------------------------------------------

export type ShardClassLiteral =
  | "grouped"
  | "per_symbol"
  | "reference"
  | "fixtures";

export type CaptureStatusLiteral =
  | "captured"
  | "empty_confirmed"
  | "attempted_failed"
  | "missing";

export interface ShardDetailCoord {
  service: string;
  category: string;
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
  category: string;
  instrument_type: string;
  data_type: string;
  day: string;
  venue?: string | null;
  underlying?: string | null;
  instrument_id?: string | null;
}): Promise<ShardDetailResponse> {
  const qp = new URLSearchParams({
    service: params.service,
    category: params.category,
    instrument_type: params.instrument_type,
    data_type: params.data_type,
    day: params.day,
  });
  if (params.venue) qp.set("venue", params.venue);
  if (params.underlying) qp.set("underlying", params.underlying);
  if (params.instrument_id) qp.set("instrument_id", params.instrument_id);
  return fetchJson<ShardDetailResponse>(
    `/data-status/shard-detail?${qp.toString()}`,
  );
}

// VenueDetail v2 — DeFi-aware.  Composite (PROTOCOL-CHAIN) vs chain-only
// paths are disambiguated via ``chain`` / ``protocol`` / ``pools`` /
// ``protocols`` being populated.  CeFi branches populate ``instruments`` +
// ``total_instruments``.
export interface VenueDetailV2Response {
  category: string;
  venue: string;
  chain: string | null;
  protocol: string | null;
  total_instruments: number;
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
  category: string;
  venue: string;
}): Promise<VenueDetailV2Response> {
  const qp = new URLSearchParams({
    service: params.service,
    category: params.category,
    venue: params.venue,
  });
  return fetchJson<VenueDetailV2Response>(
    `/data-status/venue-detail?${qp.toString()}`,
  );
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
  category: string;
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
  category: string;
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
      category: params.category.toLowerCase(),
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
  category: string;
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
    category: params.category,
    venue: params.venue,
    day: params.day,
    instrument_type: params.instrument_type,
    data_type: params.data_type,
  });
  if (params.limit !== undefined) qp.set("limit", String(params.limit));
  if (params.offset !== undefined) qp.set("offset", String(params.offset));
  if (params.search !== undefined && params.search !== "")
    qp.set("search", params.search);
  return fetchJson<InstrumentsForShardResponse>(
    `/data-status/instruments-for-shard?${qp.toString()}`,
  );
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
  category: string;
  venue: string;
  day: string;
  data_type: string;
  instrument_types: { name: string; bundling: string }[];
  recommended_instrument_type: string | null;
}

export async function fetchShardInfo(params: {
  service: string;
  category: string;
  venue: string;
  day: string;
  data_type: string;
}): Promise<ShardInfoResponse> {
  const qp = new URLSearchParams(params);
  return fetchJson<ShardInfoResponse>(`/data-status/shard-info?${qp.toString()}`);
}

export async function fetchBundlePreview(params: {
  service: string;
  category: string;
  venue: string;
  day: string;
  instrument_type: string;
  data_type: string;
  limit?: number;
}): Promise<BundlePreviewResponse> {
  const qp = new URLSearchParams({
    service: params.service,
    category: params.category,
    venue: params.venue,
    day: params.day,
    instrument_type: params.instrument_type,
    data_type: params.data_type,
  });
  if (params.limit !== undefined) qp.set("limit", String(params.limit));
  return fetchJson<BundlePreviewResponse>(
    `/data-status/bundle-preview?${qp.toString()}`,
  );
}

export interface BucketCountsResponse {
  named_market_count: number;
  other_market_count: number;
}

export async function fetchBucketCounts(params: {
  service: string;
  category: string;
  venue: string;
  day: string;
  data_type: string;
}): Promise<BucketCountsResponse> {
  const qp = new URLSearchParams(params);
  return fetchJson<BucketCountsResponse>(
    `/data-status/bucket-counts?${qp.toString()}`,
  );
}

/** Build the CSV download URL — used in an <a href> so the browser handles the download. */
export function buildCsvDownloadUrl(params: {
  service: string;
  category: string;
  venue: string;
  day: string;
  instrument_type: string;
  data_type: string;
  instrument_ids: string[];
}): string {
  const qp = new URLSearchParams({
    service: params.service,
    category: params.category,
    venue: params.venue,
    day: params.day,
    instrument_type: params.instrument_type,
    data_type: params.data_type,
    instrument_ids: params.instrument_ids.join(","),
  });
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
 * Build the shard CSV download URL for one (service, category, venue, date).
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
  category: string;
  venue: string;
  date: string;
}): string {
  const qp = new URLSearchParams({
    service: params.service,
    category: params.category,
    venue: params.venue,
    date: params.date,
  });
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
 * Per-fixture coverage for one (day, league) slice.
 *
 * ``capture_status`` values per entity match the v5 honest-coverage manifest:
 * ``captured`` / ``empty_confirmed`` / ``missing`` / ``attempted_failed``.
 */
export type FixtureCoverageStatus =
  | "captured"
  | "empty_confirmed"
  | "missing"
  | "attempted_failed";

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
export function buildFixtureDownloadUrl(params: {
  fixture_id: string;
  day: string;
  format: "csv" | "json";
}): string {
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

export async function triggerCloudBuild(
  service: string,
  branch: string = "main",
): Promise<TriggerBuildResponse> {
  return fetchJson("/cloud-builds/trigger", {
    method: "POST",
    body: JSON.stringify({ service, branch }),
  });
}

export async function getCloudBuildHistory(
  service: string,
  limit: number = 10,
): Promise<BuildHistoryResponse> {
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
  category: string;
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
    category: string;
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
  category: string;
  search?: string;
  limit?: number;
}): Promise<InstrumentsListResponse> {
  const searchParams = new URLSearchParams();
  searchParams.set("category", params.category);
  if (params.search) searchParams.set("search", params.search);
  if (params.limit) searchParams.set("limit", params.limit.toString());
  return fetchJson(`/data-status/instruments?${searchParams.toString()}`);
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
  if (params.first_day_of_month_only)
    searchParams.set("first_day_of_month_only", "true");
  if (params.service) searchParams.set("service", params.service);
  if (params.timeframe) searchParams.set("timeframe", params.timeframe);
  if (params.available_from)
    searchParams.set("available_from", params.available_from);
  if (params.available_to)
    searchParams.set("available_to", params.available_to);
  return fetchJson(
    `/data-status/instrument-availability?${searchParams.toString()}`,
  );
}

// ── Event stream ─────────────────────────────────────────────────────────────

/**
 * Return the full shard event stream for a deployment.
 * Each event captures a lifecycle step (JOB_STARTED, VM_PREEMPTED, etc.)
 * with timestamp, message, and optional metadata.
 */
export async function getDeploymentEvents(
  deploymentId: string,
  shardId?: string,
): Promise<DeploymentEventStream> {
  const params = new URLSearchParams();
  if (shardId) params.set("shard_id", shardId);
  const query = params.toString();
  return fetchJson(
    `/deployments/${deploymentId}/events${query ? `?${query}` : ""}`,
  );
}

/**
 * Return VM-level infrastructure events for a deployment.
 * Filters to: VM_PREEMPTED, VM_DELETED, VM_QUOTA_EXHAUSTED, VM_ZONE_UNAVAILABLE,
 * VM_TIMEOUT, CONTAINER_OOM, CLOUD_RUN_REVISION_FAILED.
 */
export async function getDeploymentVmEvents(
  deploymentId: string,
): Promise<DeploymentEventStream> {
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
  return fetchJson(
    `/deployments/${deploymentId}/live-health?${params.toString()}`,
  );
}

// ---------------------------------------------------------------------------
// v7 — Client subscriptions + chaos injections (Phase 4b)
// ---------------------------------------------------------------------------

import type {
  ChaosInjectionSpec,
  ClientSubscription,
  RuntimeProfile,
} from "../types";

export async function listClientSubscriptions(): Promise<ClientSubscription[]> {
  return fetchJson<ClientSubscription[]>("/subscriptions/");
}

export async function getClientSubscription(
  clientId: string,
): Promise<ClientSubscription> {
  return fetchJson<ClientSubscription>(
    `/subscriptions/${encodeURIComponent(clientId)}`,
  );
}

export async function createClientSubscription(
  sub: ClientSubscription,
): Promise<ClientSubscription> {
  return fetchJson<ClientSubscription>("/subscriptions/", {
    method: "POST",
    body: JSON.stringify(sub),
  });
}

export async function updateClientSubscription(
  clientId: string,
  patch: Partial<ClientSubscription>,
): Promise<ClientSubscription> {
  return fetchJson<ClientSubscription>(
    `/subscriptions/${encodeURIComponent(clientId)}`,
    {
      method: "PATCH",
      body: JSON.stringify(patch),
    },
  );
}

export async function listActiveChaosInjections(
  runtimeProfile?: RuntimeProfile,
): Promise<ChaosInjectionSpec[]> {
  const qs = runtimeProfile
    ? `?runtime_profile=${encodeURIComponent(runtimeProfile)}`
    : "";
  return fetchJson<ChaosInjectionSpec[]>(`/chaos/injections/${qs}`);
}

export async function createChaosInjection(
  spec: ChaosInjectionSpec,
): Promise<ChaosInjectionSpec> {
  return fetchJson<ChaosInjectionSpec>("/chaos/injections/", {
    method: "POST",
    body: JSON.stringify(spec),
  });
}

export async function deleteChaosInjection(injectionId: string): Promise<void> {
  await fetchJson<void>(
    `/chaos/injections/${encodeURIComponent(injectionId)}`,
    {
      method: "DELETE",
    },
  );
}

export { ApiError };
