/**
 * DeploymentDetail — per-target drill-down for a single deployment (a VM or a
 * Cloud Run job), at the same grade as a repo's CI detail in RepoCi: classified
 * status + exit_code + the durable run.log (GCS) link, a live event timeline
 * (VmEventsTimeline), and a live log tail (StreamingLogsPanel).
 *
 * Reuses VmEventsTimeline + StreamingLogsPanel (the per-VM detail backbone). The
 * target's metadata is read from the unified inventory by name, so a Cloud Run job
 * drills down through the same uniform shape as a VM.
 *
 * Route: /deployments/:name. Plan:
 * deployment_observability_parity_live_batch_paper_2026_06_22.md Phase 2.
 */

import { useCallback, useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { ArrowLeft, ExternalLink, Server, Workflow } from "lucide-react";
import { VmEventsTimeline } from "../components/VmEventsTimeline";
import { StreamingLogsPanel } from "../components/StreamingLogsPanel";
import { getDeploymentInventory, type DeploymentItem } from "../api/deploymentApi";
import { Card, CardContent, CardHeader, CardTitle } from "../components/ui/card";

type ChipTone = "green" | "yellow" | "red" | "gray" | "blue";
const TONE_CLASSES: Record<ChipTone, string> = {
  green: "bg-emerald-500/15 text-emerald-400 border-emerald-500/40",
  yellow: "bg-amber-500/15 text-amber-400 border-amber-500/40",
  red: "bg-red-500/15 text-red-400 border-red-500/40",
  gray: "bg-zinc-500/15 text-zinc-400 border-zinc-500/40",
  blue: "bg-cyan-500/15 text-cyan-400 border-cyan-500/40",
};

function Chip({ tone, children, testId }: { tone: ChipTone; children: React.ReactNode; testId?: string }) {
  return (
    <span
      data-testid={testId}
      className={`inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[11px] font-medium border ${TONE_CLASSES[tone]}`}
    >
      {children}
    </span>
  );
}

function statusTone(status: string): ChipTone {
  switch (status) {
    case "succeeded":
      return "green";
    case "running":
      return "blue";
    case "failed":
      return "red";
    case "stale":
      return "yellow";
    default:
      return "gray";
  }
}

export function DeploymentDetail({ name: nameProp, embedded }: { name?: string; embedded?: boolean } = {}) {
  // Standalone route reads :name from the URL; the cockpit passes it as a prop (chrome-less embed).
  const params = useParams<{ name: string }>();
  const name = nameProp ?? params.name;
  const [item, setItem] = useState<DeploymentItem | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(() => {
    if (!name) return;
    setLoading(true);
    setError(null);
    // The unified inventory carries every target's classified metadata; find this one by name.
    getDeploymentInventory()
      .then((inv) => {
        const found = inv.items.find((i) => i.name === name) ?? null;
        setItem(found);
      })
      .catch((e: unknown) => setError(e instanceof Error ? e.message : String(e)))
      .finally(() => setLoading(false));
  }, [name]);

  useEffect(() => {
    load();
  }, [load]);

  if (!name) {
    return (
      <main className="mx-auto px-4 py-6 max-w-[1280px]">
        <p className="text-sm text-[var(--color-text-muted)]">No deployment specified.</p>
      </main>
    );
  }

  const KindIcon = item?.kind === "CLOUD_RUN_JOB" ? Workflow : Server;
  // Embedded (cockpit drill panel): a chrome-less <div>, no standalone <main>/back-link.
  const Wrapper = embedded ? "div" : "main";
  const wrapperClass = embedded ? "space-y-6" : "mx-auto px-4 lg:px-6 py-6 max-w-[1280px] space-y-6";

  return (
    <Wrapper className={wrapperClass} data-testid="deployment-detail-page">
      <div className="flex flex-col gap-3">
        {!embedded && (
          <Link
            to="/deployments"
            data-testid="deployment-detail-back"
            className="inline-flex items-center gap-1 text-xs text-[var(--color-text-muted)] hover:text-[var(--color-text-primary)] w-fit"
          >
            <ArrowLeft className="h-3.5 w-3.5" /> Deployments
          </Link>
        )}
        <div className="flex flex-col sm:flex-row sm:items-center gap-3">
          <div className="flex items-center gap-2">
            <KindIcon className="h-5 w-5 text-[var(--color-accent-cyan)]" />
            <h1
              data-testid="deployment-detail-title"
              className="text-xl font-semibold font-mono text-[var(--color-text-primary)]"
            >
              {name}
            </h1>
          </div>
          {item && (
            <div className="sm:ml-auto flex flex-wrap items-center gap-2">
              <Chip tone="gray">{item.umbrella}</Chip>
              <Chip tone={item.cloud === "GCP" ? "blue" : "yellow"}>{item.cloud}</Chip>
              <Chip tone={statusTone(item.status)} testId="detail-status">
                {item.status}
              </Chip>
              {/* Close the alert → cockpit → logs → REDEPLOY walk: route to the Deploy console
                  (the embedded DeployForm, service pre-selectable) to relaunch this target. */}
              <Link
                to={`/cockpit?tab=deploy&service=${encodeURIComponent(item.service)}`}
                data-testid="detail-redeploy"
                className="inline-flex items-center gap-1 rounded-md border border-[var(--color-accent-cyan)]/40 bg-[var(--color-accent-cyan)]/10 px-2 py-0.5 text-[11px] font-medium text-[var(--color-accent-cyan)] hover:bg-[var(--color-accent-cyan)]/20"
              >
                <ExternalLink className="h-3 w-3" /> Redeploy
              </Link>
            </div>
          )}
        </div>
      </div>

      {error && (
        <div role="alert" className="text-sm text-red-400" data-testid="deployment-detail-error">
          {error}
        </div>
      )}

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm">Target</CardTitle>
        </CardHeader>
        <CardContent>
          {loading && !item ? (
            <p className="text-sm text-[var(--color-text-muted)]">Loading…</p>
          ) : item ? (
            <dl className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-sm" data-testid="deployment-detail-meta">
              <div>
                <dt className="text-[11px] text-[var(--color-text-muted)]">Kind</dt>
                <dd className="font-mono text-[var(--color-text-primary)]">{item.kind}</dd>
              </div>
              <div>
                <dt className="text-[11px] text-[var(--color-text-muted)]">Service</dt>
                <dd className="font-mono text-[var(--color-text-primary)]">{item.service || "—"}</dd>
              </div>
              <div>
                <dt className="text-[11px] text-[var(--color-text-muted)]">Asset group</dt>
                <dd className="font-mono text-[var(--color-text-primary)]">{item.asset_group || "—"}</dd>
              </div>
              <div>
                <dt className="text-[11px] text-[var(--color-text-muted)]">Exit code</dt>
                <dd data-testid="detail-exit-code">
                  {item.exit_code == null ? (
                    <span className="text-[var(--color-text-muted)]">—</span>
                  ) : (
                    <Chip tone={item.exit_code === 0 ? "green" : "red"}>
                      {item.exit_code === 137 ? "137 (OOM)" : item.exit_code}
                    </Chip>
                  )}
                </dd>
              </div>
              <div>
                <dt className="text-[11px] text-[var(--color-text-muted)]">Last run</dt>
                <dd className="font-mono text-[var(--color-text-primary)]">{item.last_run_at ?? "—"}</dd>
              </div>
              <div>
                <dt className="text-[11px] text-[var(--color-text-muted)]">Captured progress</dt>
                <dd className="font-mono text-[var(--color-text-primary)]">{item.captured_progress ?? "—"}</dd>
              </div>
              <div className="col-span-2">
                <dt className="text-[11px] text-[var(--color-text-muted)]">Durable run log</dt>
                <dd data-testid="detail-run-log">
                  {item.run_log_uri ? (
                    <a
                      href={
                        item.run_log_uri.startsWith("gs://")
                          ? `https://console.cloud.google.com/storage/browser/${item.run_log_uri.slice(5)}`
                          : item.run_log_uri
                      }
                      target="_blank"
                      rel="noreferrer"
                      className="inline-flex items-center gap-1 font-mono text-xs text-[var(--color-accent-cyan)] hover:underline break-all"
                    >
                      {item.run_log_uri}
                      <ExternalLink className="h-3 w-3 shrink-0" />
                    </a>
                  ) : (
                    <span className="text-[var(--color-text-muted)]">—</span>
                  )}
                </dd>
              </div>
            </dl>
          ) : (
            <p className="text-sm text-[var(--color-text-muted)]" data-testid="deployment-detail-notfound">
              No metadata found for this target in the inventory.
            </p>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm">Event Timeline</CardTitle>
        </CardHeader>
        <CardContent>
          <VmEventsTimeline vmName={name} limit={200} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm">Live log tail</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="h-[420px]">
            <StreamingLogsPanel vmName={name} />
          </div>
        </CardContent>
      </Card>
    </Wrapper>
  );
}
