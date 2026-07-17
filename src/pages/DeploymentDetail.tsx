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
import { Activity, AlertTriangle, ArrowLeft, ExternalLink, RotateCcw, Server, Workflow } from "lucide-react";
import { VmEventsTimeline } from "../components/VmEventsTimeline";
import { StreamingLogsPanel } from "../components/StreamingLogsPanel";
import {
  fetchVmFilteredEvents,
  getDeploymentDetail,
  getDeploymentInventory,
  type DeploymentDetail as DeploymentDetailData,
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

const GCP_PROJECT = "central-element-323112";

/** Deep-link to the target's page in the GCP/AWS console, built from its identity (Open-Q5).
 *  Pure URL construction from fields already on the item — no new API call. Returns null for a
 *  kind we can't address (e.g. a VM with no zone). */
function consoleUrl(item: DeploymentItem): { href: string; label: string } | null {
  const region = item.region ?? item.zone ?? "";
  switch (item.kind) {
    case "VM":
      if (item.cloud === "GCP" && item.zone)
        return {
          href: `https://console.cloud.google.com/compute/instancesDetail/zones/${item.zone}/instances/${encodeURIComponent(item.name)}?project=${GCP_PROJECT}`,
          label: "GCP console",
        };
      if (item.cloud === "AWS") {
        const r = region || "ap-northeast-1";
        return {
          href: `https://${r}.console.aws.amazon.com/ec2/home?region=${r}#Instances:search=${encodeURIComponent(item.name)}`,
          label: "EC2 console",
        };
      }
      return null;
    case "CLOUD_RUN_JOB":
      return {
        href: `https://console.cloud.google.com/run/jobs/details/${region || "asia-northeast1"}/${encodeURIComponent(item.name)}?project=${GCP_PROJECT}`,
        label: "GCP console",
      };
    case "CLOUD_RUN_SERVICE":
      return {
        href: `https://console.cloud.google.com/run/detail/${region || "asia-northeast1"}/${encodeURIComponent(item.name)}?project=${GCP_PROJECT}`,
        label: "GCP console",
      };
    case "CLOUD_FUNCTION":
      return {
        href: `https://console.cloud.google.com/functions/details/${region || "asia-northeast1"}/${encodeURIComponent(item.name)}?project=${GCP_PROJECT}`,
        label: "GCP console",
      };
    case "ECS_SERVICE": {
      const r = region || "ap-northeast-1";
      return {
        href: `https://${r}.console.aws.amazon.com/ecs/v2/clusters/${encodeURIComponent(item.cluster ?? "default")}/services/${encodeURIComponent(item.name)}?region=${r}`,
        label: "ECS console",
      };
    }
    case "LAMBDA": {
      const r = region || "us-east-1";
      return {
        href: `https://${r}.console.aws.amazon.com/lambda/home?region=${r}#/functions/${encodeURIComponent(item.name)}`,
        label: "Lambda console",
      };
    }
    default:
      return null;
  }
}

// Composite work-health verdict → chip tone (3-tier severity, Open-Q2).
const DETAIL_HEALTH_TONE: Record<string, ChipTone> = {
  working: "green",
  stalled: "yellow",
  "oom-risk": "red",
  "workload-dead": "red",
  "disk-full": "red",
  hung: "red",
  dead: "gray",
  unknown: "gray",
};

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-[11px] text-[var(--color-text-muted)]">{label}</dt>
      <dd className="font-mono text-[var(--color-text-primary)]" data-testid={`detail-metric-${label}`}>
        {value}
      </dd>
    </div>
  );
}

/** Work-health card — the deep D.1 metric vector from GET /{name}/detail (parent D.2). Honest
 *  point-in-time today (rolling-window persistence pending → sparkline once it lands). null for a
 *  kind without /proc capture (services/jobs) reads as an explicit "VM-only", never a fake 0. */
function WorkHealthCard({ name, health }: { name: string; health?: string | null }) {
  const [detail, setDetail] = useState<DeploymentDetailData | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    let live = true;
    setLoading(true);
    getDeploymentDetail(name)
      .then((d) => live && setDetail(d))
      .catch(() => live && setDetail(null))
      .finally(() => live && setLoading(false));
    return () => {
      live = false;
    };
  }, [name]);

  const hasVector = detail != null && (detail.cpu_pct != null || detail.mem_pct != null || detail.disk_pct != null);
  const fmtPct = (v: number | null) => (v == null ? "—" : `${Math.round(v)}%`);
  const fmtRate = (v: number | null) =>
    v == null ? "—" : v >= 1e6 ? `${(v / 1e6).toFixed(1)} MB/s` : `${Math.max(1, Math.round(v / 1e3))} KB/s`;

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm flex items-center gap-2">
          <Activity className="h-4 w-4 text-[var(--color-accent-cyan)]" />
          Work-health
          {health && (
            <Chip tone={DETAIL_HEALTH_TONE[health] ?? "gray"} testId="detail-composite-health">
              {health}
            </Chip>
          )}
        </CardTitle>
      </CardHeader>
      <CardContent data-testid="detail-work-health">
        {loading && !detail ? (
          <p className="text-xs text-[var(--color-text-muted)]">Loading…</p>
        ) : hasVector && detail ? (
          <dl className="grid grid-cols-3 sm:grid-cols-6 gap-3 text-sm">
            <Metric label="cpu" value={fmtPct(detail.cpu_pct)} />
            <Metric
              label="mem"
              value={`${fmtPct(detail.mem_pct)}${detail.mem_slope != null && detail.mem_slope > 0 ? " ↑" : ""}`}
            />
            <Metric label="disk" value={fmtPct(detail.disk_pct)} />
            <Metric label="io-write" value={fmtRate(detail.io_write_rate_bytes_sec)} />
            <Metric label="net-recv" value={fmtRate(detail.net_recv_rate_bytes_sec)} />
            <Metric
              label="workload"
              value={detail.workload_alive == null ? "—" : detail.workload_alive ? "alive" : "PID gone"}
            />
          </dl>
        ) : (
          <p className="text-xs text-[var(--color-text-muted)]" data-testid="detail-work-health-na">
            No /proc metric vector for this kind (VM-only today).
          </p>
        )}
        <p className="mt-2 text-[10px] text-[var(--color-text-muted)]">
          Point-in-time sample — rolling-window persistence pending (sparklines once it lands).
        </p>
      </CardContent>
    </Card>
  );
}

/** Cloud Run job run-history (WS-D #11) + the manifest bridge HINT (#12). Fetches /detail; renders
 *  the last-N executions so "did it fire on its cadence" is answerable by eye, plus a "rows since
 *  last run" delta and a deep-link to the consolidator page (which owns the AUTHORITATIVE
 *  did-it-produce-data verdict — this is a link + hint only). Null for non-job kinds. */
function JobRunHistoryCard({ name, item }: { name: string; item: DeploymentItem | null }) {
  const [detail, setDetail] = useState<DeploymentDetailData | null>(null);
  useEffect(() => {
    let live = true;
    getDeploymentDetail(name)
      .then((d) => live && setDetail(d))
      .catch(() => live && setDetail(null));
    return () => {
      live = false;
    };
  }, [name]);
  if (item?.kind !== "CLOUD_RUN_JOB") return null;
  const history = detail?.run_history ?? [];
  const delta = detail?.object_delta ?? null;
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm flex items-center gap-2">
          <Workflow className="h-4 w-4 text-[var(--color-accent-cyan)]" /> Run history
        </CardTitle>
      </CardHeader>
      <CardContent data-testid="detail-run-history">
        {(delta != null || item.asset_group) && (
          <p className="mb-2 text-[11px] text-[var(--color-text-muted)]" data-testid="detail-object-delta">
            {delta != null ? (
              <>
                rows since last run:{" "}
                <span className="font-mono text-[var(--color-text-primary)]">{delta.toLocaleString()}</span> ·{" "}
              </>
            ) : null}
            <Link
              to={`/consolidators${item.asset_group ? `?asset_group=${encodeURIComponent(item.asset_group)}` : ""}`}
              className="text-[var(--color-accent-cyan)] hover:underline"
              data-testid="detail-consolidator-link"
            >
              did it produce its data? → consolidator
            </Link>
          </p>
        )}
        {history.length === 0 ? (
          <p className="text-xs text-[var(--color-text-muted)]">No execution history.</p>
        ) : (
          <ul className="space-y-1 text-xs" data-testid="detail-run-history-list">
            {history.map((r) => (
              <li key={r.name} className="flex items-center gap-2 font-mono">
                <Chip tone={statusTone(r.status)}>{r.status}</Chip>
                <span className="text-[var(--color-text-secondary)]">{r.completed_at ?? r.started_at ?? "—"}</span>
                {r.duration_seconds != null && (
                  <span className="text-[var(--color-text-muted)]">{Math.round(r.duration_seconds)}s</span>
                )}
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}

/** Unreleased-resources card (WS-D #5/#17) — a non-running VM (or an orphaned DISK/STATIC_IP row)
 *  still holding billable resources, itemised with each resource's INFERRED est. monthly cost
 *  (principle 8, marked "est / refresh periodically"). Null when nothing leaked. */
function UnreleasedResourcesCard({ item }: { item: DeploymentItem | null }) {
  if (!item?.has_unreleased_resources || !item.unreleased_resources?.length) return null;
  const total = item.unreleased_resources.reduce((s, r) => s + (r.est_monthly_usd ?? 0), 0);
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm flex items-center gap-2 text-[var(--color-danger)]">
          <AlertTriangle className="h-4 w-4" /> Unreleased resources · ~${total.toFixed(0)}/mo est
        </CardTitle>
      </CardHeader>
      <CardContent data-testid="detail-unreleased">
        <p className="mb-2 text-[10px] text-[var(--color-text-muted)]">
          Inferred list-rate estimate — refresh periodically (not a billing figure).
        </p>
        <ul className="space-y-1 text-xs font-mono" data-testid="detail-unreleased-list">
          {item.unreleased_resources.map((r) => (
            <li key={`${r.type}-${r.name}`} className="flex items-center gap-2">
              <Chip tone="red">{r.type}</Chip>
              <span className="text-[var(--color-text-secondary)]">{r.name}</span>
              {r.size_gb != null && (
                <span className="text-[var(--color-text-muted)]">
                  {r.size_gb}GB {r.disk_type}
                </span>
              )}
              <span className="ml-auto text-[var(--color-danger)]">~${(r.est_monthly_usd ?? 0).toFixed(0)}/mo est</span>
            </li>
          ))}
        </ul>
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
  const consoleLink = item ? consoleUrl(item) : null;
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
              <Chip tone="gray">{item.umbrella === "NONE" ? "service" : item.umbrella}</Chip>
              <Chip tone={item.cloud === "GCP" ? "blue" : "yellow"}>{item.cloud}</Chip>
              <Chip tone={statusTone(item.status)} testId="detail-status">
                {item.status}
              </Chip>
              {/* Deep-link to the target's page in the GCP/AWS console (Open-Q5) — built from the
                  target identity, no new API call; absent for a kind we can't address. */}
              {consoleLink && (
                <a
                  href={consoleLink.href}
                  target="_blank"
                  rel="noreferrer"
                  data-testid="detail-console-link"
                  className="inline-flex items-center gap-1 rounded-md border border-[var(--color-border)] px-2 py-0.5 text-[11px] font-medium text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)] hover:border-[var(--color-accent-cyan)]/40"
                >
                  <ExternalLink className="h-3 w-3" /> {consoleLink.label}
                </a>
              )}
              {/* Close the alert → cockpit → logs → REDEPLOY walk: route to the Deploy console
                  (the embedded DeployForm, service pre-selectable) to relaunch this target. */}
              <Link
                to={`/deploy?service=${encodeURIComponent(item.service)}`}
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
              {/* Structural fields — surfaced per kind (ECS/Cloud Run/Lambda), honest-absent otherwise. */}
              {item.machine_type && (
                <div>
                  <dt className="text-[11px] text-[var(--color-text-muted)]">Machine</dt>
                  <dd className="font-mono text-[var(--color-text-primary)]">{item.machine_type}</dd>
                </div>
              )}
              {(item.desired_count != null || item.running_count != null) && (
                <div>
                  <dt className="text-[11px] text-[var(--color-text-muted)]">Tasks (running/desired)</dt>
                  <dd className="font-mono text-[var(--color-text-primary)]" data-testid="detail-tasks">
                    {item.running_count ?? "—"}/{item.desired_count ?? "—"}
                  </dd>
                </div>
              )}
              {item.revision && (
                <div>
                  <dt className="text-[11px] text-[var(--color-text-muted)]">Revision</dt>
                  <dd className="font-mono text-[var(--color-text-primary)]" data-testid="detail-revision">
                    {item.revision}
                  </dd>
                </div>
              )}
              {item.runtime != null && (
                <div>
                  <dt className="text-[11px] text-[var(--color-text-muted)]">Runtime</dt>
                  <dd className="font-mono text-[var(--color-text-primary)]">{item.runtime || "container"}</dd>
                </div>
              )}
              {item.memory_size_mb != null && (
                <div>
                  <dt className="text-[11px] text-[var(--color-text-muted)]">Memory</dt>
                  <dd className="font-mono text-[var(--color-text-primary)]">{item.memory_size_mb}MB</dd>
                </div>
              )}
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

      {/* Work-health — the deep D.1 metric vector (cpu/mem/disk/io/net/workload) from /detail,
          alongside the composite verdict (parent D.2 API layer). VM-only until Cloud Run cgroup. */}
      <WorkHealthCard name={name} health={item?.composite_health_status} />

      {/* Unreleased-resource leak (WS-D #5/#17) + Cloud Run job run-history / manifest bridge
          (WS-D #11/#12) — both null-render for kinds they don't apply to. */}
      <UnreleasedResourcesCard item={item} />
      <JobRunHistoryCard name={name} item={item} />

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
