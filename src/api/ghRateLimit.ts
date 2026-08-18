import { authHeaders } from "../auth/GoogleAuth";

const DEPLOYMENT_API = import.meta.env.VITE_DEPLOYMENT_API_URL ?? "";

/** One GitHub rate-limit resource pool (core / graphql / search). Mirrors the
 * GitHub REST `GET /rate_limit` resource shape that deployment-api proxies. */
export interface GhRatePool {
  limit: number;
  remaining: number;
  used: number;
  reset: number;
}

/** The GitHub App ("uts-ci-poller") installation-token budget — a SEPARATE
 * 5000/hr REST + 5000-pt/hr GraphQL pool the fleet's CI pollers now draw from.
 * Best-effort on the API side: absent when App creds are not configured. */
export interface GhAppRateLimit {
  resources: Record<string, GhRatePool>;
}

/** Response from `GET /api/repos/gh-rate-limit`. The whole fleet shares ONE PAT
 * (5000/hr REST budget), so a low `core` pool is the fleet-wide 403 source. The
 * optional `app` block is the GitHub App pool (separate budget) — present only
 * when deployment-api can mint an App installation token. */
export interface GhRateLimit {
  fetched_at: string;
  resources: Record<string, GhRatePool>;
  app?: GhAppRateLimit;
}

async function handleResponse<T>(response: Response): Promise<T> {
  if (!response.ok) {
    const text = await response.text().catch(() => "Unknown error");
    throw new Error(`HTTP ${response.status}: ${text}`);
  }
  return response.json() as Promise<T>;
}

export async function fetchGhRateLimit(signal?: AbortSignal): Promise<GhRateLimit> {
  const response = await fetch(`${DEPLOYMENT_API}/api/repos/gh-rate-limit`, {
    headers: authHeaders(),
    ...(signal ? { signal } : {}),
  });
  return handleResponse<GhRateLimit>(response);
}
