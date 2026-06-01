const DEPLOYMENT_API = import.meta.env.VITE_DEPLOYMENT_API_URL ?? "";

export interface RepoCoverage {
  repo: string;
  all_above_target: boolean;
  snapshot_at: string | null;
  worst_surface: string | null;
  worst_actual_pct: number | null;
  worst_target_pct: number | null;
}

async function handleResponse<T>(response: Response): Promise<T> {
  if (!response.ok) {
    const text = await response.text().catch(() => "Unknown error");
    throw new Error(`HTTP ${response.status}: ${text}`);
  }
  return response.json() as Promise<T>;
}

export async function fetchRepoCoverage(): Promise<RepoCoverage[]> {
  const response = await fetch(`${DEPLOYMENT_API}/api/repos/coverage`);
  return handleResponse<RepoCoverage[]>(response);
}
