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
import { AlertTriangle, ArrowLeft, ExternalLink, RotateCcw, Server, Workflow } from "lucide-react";
import { VmEventsTimeline } from "../components/VmEventsTimeline";
import { StreamingLogsPanel } from "../components/StreamingLogsPanel";
import {
  fetchVmFilteredEvents,
  getDeploymentInventory,
  type DeploymentItem,
  type VMLifecycleEvent,
} from "../api/deploymentApi";
import { getUnifiedAlerts, type UnifiedAlertEntry } from "../api/client";
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

// Restart / escalation lifecycle event kinds — the "did it restart / escalate?" answer for the
// end-to-end click-through. Matched case-insensitively against the event name (the runtime emits
// e.g. RESTARTED / RESTART_REQUESTED / ESCALATED / WATCHDOG_KILLED / FAILOVER_*); the broad
// substring match keeps the card useful as the event vocabulary grows without re-coding.
const LIFECYCLE_EVENT_PATTERNS = ["restart", "escalat", "failover", "watchdog", "respawn", "killed"];

function isLifecycleEvent(eventName: string): boolean {
  const lower = eventName.toLowerCase();
  return LIFECYCLE_EVENT_PATTERNS.some((p) => lower.includes(p));
}

/** Alert severity → chip tone (CRITICAL/ERROR red, WARNING amber, else gray). */
function alertTone(severity: string | null): ChipTone {
  const s = (severity ?? "").toUpperCase();
  if (s === "CRITICAL" || s === "ERROR") return "red";
  if (s === "WARNING" || s === "WARN") return "yellow";
  return "gray";
}

/**
 * Alerts & lifecycle — the end-to-end "what happened to this deployment" answer that closes
 * the lifecycle click-through (logs → alerts → did-it-restart/escalate). Composes EXISTING
 * endpoints, no new backend: GET /api/alerts (filtered to this target by name in repo/message)
 * + the deployment's own event stream (GET /api/vm/{name}/events) narrowed to restart/escalation
 * kinds. An empty result reads HONESTLY ("no alerts / no restart-or-escalation events"), never a
 * fabricated all-clear.
 */
function AlertsLifecycleCard({ name }: { name: string }) {
  const [alerts, setAlerts] = useState<UnifiedAlertEntry[]>([]);
  const [lifecycle, setLifecycle] = useState<VMLifecycleEvent[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(() => {
    setLoading(true);
    setError(null);
    Promise.allSettled([getUnifiedAlerts(), fetchVmFilteredEvents(name, { limit: 200 })])
      .then(([alertsRes, eventsRes]) => {
        if (alertsRes.status === "fulfilled") {
          const lower = name.toLowerCase();
          // Match the deployment by name in the alert's repo OR message (the alert ledger is
          // CI/infra-class-keyed; a deployment-scoped alert names the target in one of these).
          setAlerts(
            alertsRes.value.alerts.filter(
              (a) => (a.repo ?? "").toLowerCase().includes(lower) || (a.message ?? "").toLowerCase().includes(lower),
            ),
          );
        }
        if (eventsRes.status === "fulfilled") {
          setLifecycle(eventsRes.value.events.filter((e) => isLifecycleEvent(e.event)));
        }
        if (alertsRes.status === "rejected" && eventsRes.status === "rejected") {
          const r = alertsRes.reason;
          setError(r instanceof Error ? r.message : "alerts + lifecycle unavailable");
        }
      })
      .finally(() => setLoading(false));
  }, [name]);

  useEffect(() => {
    load();
  }, [load]);

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm flex items-center gap-2">
          <AlertTriangle className="h-4 w-4 text-[var(--color-accent-cyan)]" />
          Alerts & lifecycle
          <span className="text-[11px] font-normal text-[var(--color-text-muted)]">
            — did it alert / restart / escalate?
          </span>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4" data-testid="detail-alerts-lifecycle">
        {error && (
          <div role="alert" className="text-xs text-red-400" data-testid="detail-alerts-error">
            {error}
          </div>
        )}

        {/* Alerts scoped to this deployment. */}
        <div>
          <h3 className="mb-1.5 text-[11px] font-semibold uppercase tracking-wide text-[var(--color-text-muted)]">
            Alerts ({alerts.length})
          </h3>
          {loading && alerts.length === 0 ? (
            <p className="text-xs text-[var(--color-text-muted)]">Loading…</p>
          ) : alerts.length === 0 ? (
            <p className="text-xs text-[var(--color-text-muted)]" data-testid="detail-alerts-empty">
              No alerts reference this deployment.
            </p>
          ) : (
            <ul className="space-y-1" data-testid="detail-alerts-list">
              {alerts.map((a, i) => (
                <li
                  key={`${a.repo}-${a.timestamp}-${i}`}
                  className="flex items-start gap-2 text-xs"
                  data-testid="detail-alert-row"
                >
                  <Chip tone={alertTone(a.severity)}>{a.severity ?? a.conclusion ?? "alert"}</Chip>
                  <span className="font-mono text-[var(--color-text-muted)] shrink-0">
                    {a.timestamp.slice(5, 16).replace("T", " ")}
                  </span>
                  <span className="text-[var(--color-text-secondary)]">{a.message ?? a.workflow_name}</span>
                </li>
              ))}
            </ul>
          )}
        </div>

        {/* Restart / escalation lifecycle events (from the deployment's own event stream). */}
        <div>
          <h3 className="mb-1.5 text-[11px] font-semibold uppercase tracking-wide text-[var(--color-text-muted)] flex items-center gap-1">
            <RotateCcw className="h-3 w-3" />
            Restart / escalation ({lifecycle.length})
          </h3>
          {loading && lifecycle.length === 0 ? (
            <p className="text-xs text-[var(--color-text-muted)]">Loading…</p>
          ) : lifecycle.length === 0 ? (
            <p className="text-xs text-[var(--color-text-muted)]" data-testid="detail-lifecycle-empty">
              No restart or escalation events for this deployment.
            </p>
          ) : (
            <ul className="space-y-1" data-testid="detail-lifecycle-list">
              {lifecycle.map((e, i) => (
                <li
                  key={`${e.event}-${e.timestamp}-${i}`}
                  className="flex items-start gap-2 text-xs"
                  data-testid="detail-lifecycle-row"
                >
                  <Chip tone={e.severity === "ERROR" || e.severity === "CRITICAL" ? "red" : "yellow"}>{e.event}</Chip>
                  <span className="font-mono text-[var(--color-text-muted)]">
                    {e.timestamp.slice(5, 19).replace("T", " ")}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </CardContent>
    </Card>
  );
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

      {/* Alerts + restart/escalation lifecycle — the end-to-end "what happened" answer
          (composes /api/alerts + the deployment event stream; no new endpoint). */}
      <AlertsLifecycleCard name={name} />

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
