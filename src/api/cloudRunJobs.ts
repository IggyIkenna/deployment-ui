/**
 * Cloud Run Job registry API — the scheduled Cloud Run JOB estate (data-pipeline watchers,
 * deployment digest, monitoring deadman, consolidator liveness, wave launcher, honest
 * coverage, sports scheduler, …) declared in deployment-service/terraform/gcp/*.tf.
 *
 * Backend: deployment-api `GET /api/cloud-run-jobs` returns the CLOUD_RUN_JOB_REGISTRY —
 * a dict keyed by job name, each entry `{ terraform_file, scheduler_cadence, purpose }`.
 * Contract shape pre-agreed in plan deployment_service_api_integration_cleanup_2026_08_18.md
 * items 5-7 (registry module → QG parity → route). MOCK mode serves src/lib/mock-api.ts.
 *
 * Same raw-fetch + handleResponse shape as src/api/deploymentApi.ts so the UI reads one
 * consistent client.
 */

import { authHeaders } from "../auth/GoogleAuth";

const DEPLOYMENT_API = import.meta.env.VITE_DEPLOYMENT_API_URL ?? "";

async function handleResponse<T>(response: Response): Promise<T> {
  if (!response.ok) {
    const text = await response.text().catch(() => "Unknown error");
    throw new Error(`HTTP ${response.status}: ${text}`);
  }
  return response.json() as Promise<T>;
}

/** One scheduled Cloud Run Job's registry entry — mirrors the backend CloudRunJobEntry. */
export interface CloudRunJobEntry {
  /** Defining terraform file, cited SYMBOLICALLY (the filename, never a hardcoded image path). */
  terraform_file: string;
  /** Cloud Scheduler cron cadence (declared config) — "—" when the job has no scheduler trigger. */
  scheduler_cadence: string;
  /** One-line purpose. */
  purpose: string;
}

/** GET /api/cloud-run-jobs — dict keyed by job name (mirrors CLOUD_RUN_JOB_REGISTRY). */
export type CloudRunJobsResponse = Record<string, CloudRunJobEntry>;

export async function getCloudRunJobs(): Promise<CloudRunJobsResponse> {
  const response = await fetch(`${DEPLOYMENT_API}/api/cloud-run-jobs`, { headers: authHeaders() });
  return handleResponse<CloudRunJobsResponse>(response);
}
