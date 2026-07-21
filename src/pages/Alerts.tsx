/**
 * Alerts — unified alert traceability across all alert classes (operator requirement 2026-06-10).
 *
 * Consumes GET /api/alerts (unified ledger) rather than /api/repo-ci/alerts (CI/CD-only).
 * Current `kind` values: "alert" | "event" (CI/CD). When INFRA P1 lands
 * (alert_quality_overhaul_2026_06_18.md) non-CI kinds appear automatically:
 * "vm_down" | "consolidator_down" | "git_health" | "worker_liveness" | "data_pipeline".
 *
 * Shows (1) lifecycle STREAMS per (repo, workflow) — the CURRENT state vs the PREVIOUS
 * state, worst-first — and (2) the raw alert timeline with severity + run links. The
 * answer to "how did this reach alerting point and where is it now" without scrollback.
 *
 * Plan: deployment_ui_monitoring_pane_2026_06_19.md (unified ledger UI P1).
 */

import { useCallback, useEffect, useState } from "react";
import { ArrowUpRight, BellRing, ExternalLink, RefreshCw } from "lucide-react";
import { Link } from "react-router-dom";
import { getUnifiedAlerts, type UnifiedAlertEntry, type UnifiedAlerts } from "../api/client";
import { formatAge } from "../lib/repoCi";
import { Button } from "../components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "../components/ui/card";
import { useVisibilityPausedInterval } from "../hooks/useVisibilityPausedInterval";

function severityTone(entry: UnifiedAlertEntry): string {
  if (entry.severity === "CRITICAL" || entry.conclusion === "failure")
    return "bg-red-500/15 text-red-400 border-red-500/40";
  if (entry.severity === "WARNING") return "bg-amber-500/15 text-amber-400 border-amber-500/40";
  return "bg-emerald-500/15 text-emerald-400 border-emerald-500/40";
}

/** Map the `kind` discriminator to a compact human label for the domain badge. */
function kindLabel(kind: string): string {
  switch (kind) {
    case "alert":
    case "event":
      return "CI";
    case "vm_down":
      return "VM";
    case "consolidator_down":
      return "CONS";
    case "git_health":
      return "GIT";
    case "worker_liveness":
      return "WRKR";
    case "data_pipeline":
      return "DATA";
    default:
      return kind.toUpperCase().slice(0, 5);
  }
}

function ageMin(ts: string): number | null {
  const parsed = Date.parse(ts);
  return Number.isNaN(parsed) ? null : Math.floor((Date.now() - parsed) / 60000);
}

function EntryChip({ entry, testId }: { entry: UnifiedAlertEntry; testId?: string }) {
  return (
    <span
      data-testid={testId}
      className={`inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[11px] font-medium border ${severityTone(entry)}`}
    >
      {entry.severity ?? entry.conclusion ?? "event"}
    </span>
  );
}

function DomainChip({ kind }: { kind: string }) {
  return (
    <span
      data-testid="alert-domain-chip"
      className="inline-flex items-center rounded px-1.5 py-0.5 text-[11px] font-mono font-medium bg-slate-500/15 text-slate-400 border border-slate-500/40"
      title={`kind: ${kind}`}
    >
      {kindLabel(kind)}
    </span>
  );
}

export function AlertsContent() {
  const [data, setData] = useState<UnifiedAlerts | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const load = useCallback(() => {
    setLoading(true);
    setError(null);
    getUnifiedAlerts()
      .then(setData)
      .catch((e: unknown) => setError(e instanceof Error ? e.message : String(e)))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  // Pauses while the tab is hidden; resumes with an immediate refresh.
  useVisibilityPausedInterval(load, 60_000);

  return (
    <div className="space-y-4" data-testid="alerts-page">
      <div className="flex items-center justify-between">
        <h1 className="text-lg font-semibold text-[var(--color-text-primary)] flex items-center gap-2">
          <BellRing className="h-5 w-5 text-amber-400" /> Alerts — unified traceability
          {data && (
            <span
              data-testid="alerts-source-badge"
              className={`inline-flex items-center rounded px-1.5 py-0.5 text-[11px] font-medium border ${
                data.source === "live" || data.source === "mock"
                  ? "bg-emerald-500/15 text-emerald-400 border-emerald-500/40"
                  : "bg-amber-500/15 text-amber-400 border-amber-500/40"
              }`}
              title={`generated_at: ${data.generated_at}`}
            >
              {data.source.toUpperCase()} · as of {data.generated_at.slice(11, 19)}Z
            </span>
          )}
        </h1>
        <Button onClick={load} variant="ghost" size="sm" disabled={loading} data-testid="alerts-refresh">
          <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
        </Button>
      </div>
      {error && (
        <div className="p-3 rounded-lg status-error text-sm text-red-400" data-testid="alerts-error">
          {error}
        </div>
      )}
      {data && (
        <>
          <Card data-testid="alert-streams">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm">Streams — current vs previous state (worst first)</CardTitle>
            </CardHeader>
            <CardContent className="space-y-1.5">
              {data.streams.length === 0 && (
                <p className="text-sm text-[var(--color-text-muted)]">No alert streams in the window.</p>
              )}
              {data.streams.map((stream) => (
                <div
                  key={`${stream.repo}/${stream.workflow_name}`}
                  className="flex items-center gap-2 text-sm flex-wrap"
                  data-testid={`alert-stream-${stream.repo}-${stream.workflow_name}`}
                >
                  <DomainChip kind={stream.current.kind} />
                  <span className="font-mono text-[var(--color-text-primary)]">
                    {stream.repo} / {stream.workflow_name}
                  </span>
                  {stream.previous && (
                    <>
                      <EntryChip entry={stream.previous} testId="stream-previous" />
                      <span className="text-[var(--color-text-muted)]">→</span>
                    </>
                  )}
                  <EntryChip entry={stream.current} testId="stream-current" />
                  <span className="text-[var(--color-text-muted)]">
                    {formatAge(ageMin(stream.current.timestamp))} ago · {stream.count} event
                    {stream.count === 1 ? "" : "s"}
                  </span>
                </div>
              ))}
            </CardContent>
          </Card>
          <Card data-testid="alert-timeline">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm">Alert timeline (newest first)</CardTitle>
            </CardHeader>
            <CardContent className="space-y-1.5">
              {data.alerts.length === 0 && (
                <p className="text-sm text-[var(--color-text-muted)]">
                  No alerts persisted yet — the ledger fills as notify-slack posts.
                </p>
              )}
              {data.alerts.map((alert, index) => (
                <div
                  key={`${alert.timestamp}-${index}`}
                  className="flex items-start gap-2 text-sm"
                  data-testid={`alert-entry-${index}`}
                >
                  <DomainChip kind={alert.kind} />
                  <EntryChip entry={alert} />
                  <span
                    className="font-mono text-[var(--color-text-secondary)] shrink-0"
                    data-testid={`alert-entry-timestamp-${index}`}
                    title={alert.timestamp}
                  >
                    {alert.timestamp.slice(0, 16).replace("T", " ")}
                  </span>
                  <span className="font-mono text-[var(--color-text-muted)] shrink-0">{alert.repo}</span>
                  {alert.workflow_name && (
                    <span
                      className="font-mono text-[var(--color-text-muted)] shrink-0"
                      data-testid={`alert-entry-workflow-${index}`}
                    >
                      {alert.workflow_name}
                    </span>
                  )}
                  <span className="text-[var(--color-text-primary)]">{alert.message}</span>
                  {alert.deployment_target && (
                    <Link
                      to={`/deployments/${encodeURIComponent(alert.deployment_target)}`}
                      className="inline-flex shrink-0 items-center gap-0.5 text-[var(--color-text-muted)] hover:text-[var(--color-text-primary)]"
                      title={`Open ${alert.deployment_target} in Deployments`}
                      data-testid={`alert-deployment-link-${index}`}
                    >
                      <ArrowUpRight className="h-3 w-3" />
                      <span className="text-xs">deployment</span>
                    </Link>
                  )}
                  {alert.run_url && (
                    <a href={alert.run_url} target="_blank" rel="noreferrer" className="text-[var(--color-text-muted)]">
                      <ExternalLink className="h-3 w-3" />
                    </a>
                  )}
                </div>
              ))}
            </CardContent>
          </Card>
        </>
      )}
      {!data && !error && <p className="text-sm text-[var(--color-text-muted)]">Loading…</p>}
    </div>
  );
}
