/**
 * /cloud-run-jobs — the scheduled Cloud Run JOB registry (read-only).
 *
 * Renders `GET /api/cloud-run-jobs`: every scheduled Cloud Run Job declared in
 * deployment-service/terraform/gcp/ — data-pipeline watchers, deployment digest,
 * monitoring deadman, consolidator liveness, wave launcher, honest coverage, sports
 * scheduler, subgraph probe, VM log archival, serial capture. One flat table:
 * job name · defining terraform file · scheduler cadence · purpose.
 *
 * READ-ONLY by design — a "trigger now" action is explicitly OUT of scope (plan
 * deployment_service_api_integration_cleanup_2026_08_18.md item 9): no established UI
 * precedent to mirror, and it would need its own IAM/audit-log review the way the
 * VM auto-launch split did.
 *
 * Mirrors the standalone ops-inventory page pattern (CostObservability/ArtifactPipeline):
 * plain fetch + useState/useEffect with a request-id guard, self-contained, styled off
 * the app's CSS custom-property tokens.
 */
import { useEffect, useRef, useState } from "react";
import { Cloud, Loader2 } from "lucide-react";
import { getCloudRunJobs, type CloudRunJobsResponse } from "../api/cloudRunJobs";

export function CloudRunJobs() {
  const [registry, setRegistry] = useState<CloudRunJobsResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const requestIdRef = useRef(0);

  useEffect(() => {
    const requestId = ++requestIdRef.current;
    setLoading(true);
    setError(null);
    getCloudRunJobs()
      .then((data) => {
        if (requestIdRef.current === requestId) {
          setRegistry(data);
        }
      })
      .catch((e: unknown) => {
        if (requestIdRef.current === requestId) {
          setError(e instanceof Error ? e.message : String(e));
        }
      })
      .finally(() => {
        if (requestIdRef.current === requestId) {
          setLoading(false);
        }
      });
  }, []);

  const entries = registry ? Object.entries(registry).sort(([a], [b]) => a.localeCompare(b)) : [];

  return (
    <main data-testid="cloud-run-jobs-page" className="app-shell-gutter py-4">
      <div className="mb-4">
        <h1 className="flex items-center gap-2 text-lg font-semibold text-[var(--color-text-primary)]">
          <Cloud className="h-5 w-5 text-[var(--color-accent-blue)]" />
          Cloud Run Jobs
        </h1>
        <p className="text-xs text-[var(--color-text-secondary)]">
          Scheduled Cloud Run Job registry — every job declared in deployment-service/terraform/gcp/. Read-only listing.
        </p>
      </div>

      {loading && (
        <div
          className="flex items-center gap-2 text-sm text-[var(--color-text-secondary)]"
          data-testid="cloud-run-jobs-loading"
        >
          <Loader2 className="h-4 w-4 animate-spin" /> Loading registry…
        </div>
      )}

      {error && (
        <div
          className="rounded-lg border border-[var(--color-accent-red)]/30 bg-[var(--color-accent-red)]/10 p-4 text-sm text-[var(--color-accent-red)]"
          role="alert"
          data-testid="cloud-run-jobs-error"
        >
          Failed to load Cloud Run Job registry: {error}
        </div>
      )}

      {!loading && !error && entries.length === 0 && (
        <div
          className="rounded-lg border border-[var(--color-bg-tertiary)] p-4 text-sm text-[var(--color-text-secondary)]"
          data-testid="cloud-run-jobs-empty"
        >
          No Cloud Run Jobs registered.
        </div>
      )}

      {!loading && !error && entries.length > 0 && (
        <div className="overflow-x-auto rounded-lg border border-[var(--color-bg-tertiary)]">
          <table className="w-full text-left text-sm" data-testid="cloud-run-jobs-table">
            <thead className="border-b border-[var(--color-bg-tertiary)] text-xs uppercase tracking-wide text-[var(--color-text-tertiary)]">
              <tr>
                <th className="px-4 py-2">Job</th>
                <th className="px-4 py-2">Terraform file</th>
                <th className="px-4 py-2">Scheduler cadence</th>
                <th className="px-4 py-2">Purpose</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--color-bg-tertiary)]">
              {entries.map(([name, entry]) => (
                <tr key={name} data-testid={`cloud-run-job-${name}`} className="align-top">
                  <td className="px-4 py-2 font-mono text-[var(--color-text-primary)]">{name}</td>
                  <td className="px-4 py-2 font-mono text-xs text-[var(--color-text-secondary)]">
                    {entry.terraform_file}
                  </td>
                  <td className="px-4 py-2 text-[var(--color-text-secondary)]">{entry.scheduler_cadence || "—"}</td>
                  <td className="px-4 py-2 text-[var(--color-text-secondary)]">{entry.purpose}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </main>
  );
}

export default CloudRunJobs;
