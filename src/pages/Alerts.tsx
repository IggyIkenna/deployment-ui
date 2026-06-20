/**
 * Alerts — unified alert ledger (operator requirement 2026-06-10 / 2026-06-19).
 *
 * Consumes GET /api/alerts — a superset of /api/repo-ci/alerts that covers all
 * alert classes: CI/workflow, VM-down, consolidator-down, git-health-guard,
 * worker-liveness, and data-pipeline alerts.  Each entry carries a ``domain``
 * discriminator shown as a badge in the timeline and streams.
 *
 * Plan: deployment_ui_monitoring_pane_2026_06_19.md § UI P1.
 */

import { useCallback, useEffect, useState } from "react";
import { BellRing, ExternalLink, RefreshCw } from "lucide-react";
import { getAlerts, type UnifiedAlertEntry, type UnifiedAlerts } from "../api/client";
import { formatAge } from "../lib/repoCi";
import { Button } from "../components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "../components/ui/card";

function severityTone(entry: UnifiedAlertEntry): string {
  if (entry.severity === "CRITICAL" || entry.conclusion === "failure")
    return "bg-red-500/15 text-red-400 border-red-500/40";
  if (entry.severity === "WARNING") return "bg-amber-500/15 text-amber-400 border-amber-500/40";
  return "bg-emerald-500/15 text-emerald-400 border-emerald-500/40";
}

const DOMAIN_LABELS: Record<string, string> = {
  ci: "CI",
  vm: "VM",
  consolidator: "CONS",
  "git-health": "GIT",
  "worker-liveness": "WRKR",
  "data-pipeline": "DATA",
};

function domainTone(domain: string): string {
  switch (domain) {
    case "ci":
      return "bg-blue-500/15 text-blue-400 border-blue-500/40";
    case "vm":
      return "bg-purple-500/15 text-purple-400 border-purple-500/40";
    case "consolidator":
      return "bg-orange-500/15 text-orange-400 border-orange-500/40";
    case "git-health":
      return "bg-cyan-500/15 text-cyan-400 border-cyan-500/40";
    case "worker-liveness":
      return "bg-violet-500/15 text-violet-400 border-violet-500/40";
    case "data-pipeline":
      return "bg-teal-500/15 text-teal-400 border-teal-500/40";
    default:
      return "bg-zinc-500/15 text-zinc-400 border-zinc-500/40";
  }
}

function DomainChip({ domain }: { domain: string }) {
  return (
    <span
      data-testid={`domain-badge-${domain}`}
      className={`inline-flex items-center rounded px-1.5 py-0.5 text-[10px] font-medium border ${domainTone(domain)}`}
    >
      {DOMAIN_LABELS[domain] ?? domain.toUpperCase()}
    </span>
  );
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

export function AlertsContent() {
  const [data, setData] = useState<UnifiedAlerts | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const load = useCallback(() => {
    setLoading(true);
    setError(null);
    getAlerts()
      .then(setData)
      .catch((e: unknown) => setError(e instanceof Error ? e.message : String(e)))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    load();
    const timer = setInterval(load, 60_000);
    return () => clearInterval(timer);
  }, [load]);

  return (
    <div className="space-y-4" data-testid="alerts-page">
      <div className="flex items-center justify-between">
        <h1 className="text-lg font-semibold text-[var(--color-text-primary)] flex items-center gap-2">
          <BellRing className="h-5 w-5 text-amber-400" /> Alerts — unified ledger
          {data && (
            <span
              data-testid="alerts-source-badge"
              className={`inline-flex items-center rounded px-1.5 py-0.5 text-[11px] font-medium border ${
                data.source === "live"
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
                  <DomainChip domain={stream.current.domain} />
                  <span className="font-mono text-[var(--color-text-primary)]">
                    {stream.repo ? `${stream.repo} / ` : ""}{stream.workflow_name}
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
              <CardTitle className="text-sm">Alert timeline — all domains (newest first)</CardTitle>
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
                  <DomainChip domain={alert.domain} />
                  <EntryChip entry={alert} />
                  <span className="font-mono text-[var(--color-text-secondary)] shrink-0">
                    {alert.timestamp.slice(11, 16)}
                  </span>
                  {alert.repo && (
                    <span className="font-mono text-[var(--color-text-muted)] shrink-0">{alert.repo}</span>
                  )}
                  <span className="text-[var(--color-text-primary)]">{alert.message}</span>
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
