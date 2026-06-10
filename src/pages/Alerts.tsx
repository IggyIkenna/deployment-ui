/**
 * Alerts — full Slack-alert traceability (operator requirement 2026-06-10).
 *
 * Every alert that goes through Slack is persisted to the cicd-events ledger; this page
 * shows (1) lifecycle STREAMS per (repo, workflow) — the CURRENT state vs the PREVIOUS
 * state, worst-first — and (2) the raw alert timeline with severity + run links. The
 * answer to "how did this reach alerting point and where is it now" without scrollback.
 *
 * Plan: ci_dashboard_deployment_ui_2026_06_10.md (alert-history mirror, v1).
 */

import { useCallback, useEffect, useState } from "react";
import { BellRing, ExternalLink, RefreshCw } from "lucide-react";
import { getRepoCiAlerts, type RepoCiAlertEntry, type RepoCiAlerts } from "../api/client";
import { formatAge } from "../lib/repoCi";
import { Button } from "../components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "../components/ui/card";

function severityTone(entry: RepoCiAlertEntry): string {
  if (entry.severity === "CRITICAL" || entry.conclusion === "failure")
    return "bg-red-500/15 text-red-400 border-red-500/40";
  if (entry.severity === "WARNING") return "bg-amber-500/15 text-amber-400 border-amber-500/40";
  return "bg-emerald-500/15 text-emerald-400 border-emerald-500/40";
}

function ageMin(ts: string): number | null {
  const parsed = Date.parse(ts);
  return Number.isNaN(parsed) ? null : Math.floor((Date.now() - parsed) / 60000);
}

function EntryChip({ entry, testId }: { entry: RepoCiAlertEntry; testId?: string }) {
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
  const [data, setData] = useState<RepoCiAlerts | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const load = useCallback(() => {
    setLoading(true);
    setError(null);
    getRepoCiAlerts()
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
          <BellRing className="h-5 w-5 text-amber-400" /> Alerts — lifecycle traceability
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
                  <EntryChip entry={alert} />
                  <span className="font-mono text-[var(--color-text-secondary)] shrink-0">
                    {alert.timestamp.slice(11, 16)}
                  </span>
                  <span className="font-mono text-[var(--color-text-muted)] shrink-0">{alert.repo}</span>
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
