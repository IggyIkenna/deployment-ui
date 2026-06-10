const DEPLOYMENT_API = import.meta.env.VITE_DEPLOYMENT_API_URL ?? "";

/** One GitHub rate-limit resource pool (core / graphql / search). Mirrors the
 * GitHub REST `GET /rate_limit` resource shape that deployment-api proxies. */
export interface GhRatePool {
  limit: number;
  remaining: number;
  used: number;
  reset: number;
}

/** Response from `GET /api/repos/gh-rate-limit`. The whole fleet shares ONE PAT
 * (5000/hr REST budget), so a low `core` pool is the fleet-wide 403 source. */
export interface GhRateLimit {
  fetched_at: string;
  resources: Record<string, GhRatePool>;
}

async function handleResponse<T>(response: Response): Promise<T> {
  if (!response.ok) {
    const text = await response.text().catch(() => "Unknown error");
    throw new Error(`HTTP ${response.status}: ${text}`);
  }
  return response.json() as Promise<T>;
}

export async function fetchGhRateLimit(signal?: AbortSignal): Promise<GhRateLimit> {
  const response = await fetch(`${DEPLOYMENT_API}/api/repos/gh-rate-limit`, signal ? { signal } : undefined);
  return handleResponse<GhRateLimit>(response);
}
