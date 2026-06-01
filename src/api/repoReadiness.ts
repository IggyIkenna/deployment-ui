const DEPLOYMENT_API = import.meta.env.VITE_DEPLOYMENT_API_URL ?? "";

export interface RepoReadiness {
  repo: string;
  deploy_ready: boolean;
  reason: string;
  last_snapshot_date: string | null;
}

async function handleResponse<T>(response: Response): Promise<T> {
  if (!response.ok) {
    const text = await response.text().catch(() => "Unknown error");
    throw new Error(`HTTP ${response.status}: ${text}`);
  }
  return response.json() as Promise<T>;
}

export async function fetchRepoReadiness(): Promise<RepoReadiness[]> {
  const response = await fetch(`${DEPLOYMENT_API}/api/repos/deploy-ready`);
  return handleResponse<RepoReadiness[]>(response);
}
