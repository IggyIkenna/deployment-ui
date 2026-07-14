import { useCallback, useEffect, useRef, useState } from "react";
import {
  fetchVmDeployments,
  fetchVmLogs,
  type VmDeploymentEntry,
  type VmLogLine,
  type VmLogTailResult,
} from "../api/deploymentApi";
import { VmHealthBadge } from "../components/VmHealthBadge";
import { Badge } from "../components/ui/badge";
import { Button } from "../components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "../components/ui/card";
import { Skeleton } from "../components/ui/skeleton";
import { useVmWebSocket } from "../hooks/useVmWebSocket";
import { useVisibilityPausedInterval } from "../hooks/useVisibilityPausedInterval";

const REFRESH_INTERVAL_MS = 30_000;
const LOG_POLL_MS = 10_000;

function formatTs(value: string | null): string {
  if (!value) return "—";
  try {
    return new Date(value).toLocaleString([], {
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    });
  } catch {
    return value;
  }
}

function stalenessSeconds(heartbeatAt: string | null): number | null {
  if (!heartbeatAt) return null;
  const ts = new Date(heartbeatAt).getTime();
  if (isNaN(ts)) return null;
  return Math.round((Date.now() - ts) / 1000);
}

function formatStaleness(sec: number | null): string {
  if (sec === null) return "—";
  if (sec < 60) return `${sec}s`;
  if (sec < 3600) return `${Math.round(sec / 60)}m`;
  return `${Math.round(sec / 3600)}h`;
}

function stalenessVariant(sec: number | null): "success" | "warning" | "error" | "default" {
  if (sec === null) return "default";
  if (sec < 300) return "success";
  if (sec < 1800) return "warning";
  return "error";
}

interface LiveServiceRow {
  entry: VmDeploymentEntry;
  stalenessS: number | null;
}

function buildRows(active: VmDeploymentEntry[]): LiveServiceRow[] {
  return active
    .filter((e) => e.mode === "live")
    .map((entry) => ({
      entry,
      stalenessS: stalenessSeconds(entry.last_heartbeat_at),
    }))
    .sort((a, b) => (a.stalenessS ?? Infinity) - (b.stalenessS ?? Infinity));
}

function severityColor(severity: string): string {
  if (severity === "ERROR" || severity === "CRITICAL") return "text-red-500";
  if (severity === "WARNING") return "text-yellow-500";
  return "text-[var(--color-text-secondary)]";
}

function VmEventPanel({ vmName }: { vmName: string }) {
  const { events, connected, error } = useVmWebSocket(vmName);

  return (
    <Card className="mt-2">
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle className="text-base">
            Event stream — <span className="font-mono text-sm">{vmName}</span>
          </CardTitle>
          <span className="text-xs">
            {connected ? (
              <span className="text-green-600 font-medium">● live</span>
            ) : (
              <span className="text-[var(--color-text-muted)]">○ disconnected</span>
            )}
          </span>
        </div>
      </CardHeader>
      <CardContent>
        {error && <p className="text-sm text-red-600 mb-2">{error}</p>}
        {events.length === 0 ? (
          <p className="text-sm text-[var(--color-text-muted)] py-4 text-center">
            {connected ? "Waiting for events…" : "Connecting…"}
          </p>
        ) : (
          <div
            data-testid="vm-event-feed"
            aria-live="polite"
            aria-label="VM lifecycle events"
            aria-atomic="false"
            className="font-mono text-xs space-y-1 max-h-64 overflow-y-auto"
          >
            {[...events].reverse().map((evt, i) => (
              <div key={i} className="flex gap-2 items-start">
                <span className="text-[var(--color-text-muted)] shrink-0">
                  {new Date(evt.timestamp).toLocaleTimeString()}
                </span>
                <span className={`shrink-0 font-semibold ${severityColor(evt.severity)}`}>{evt.event}</span>
                <span className="text-[var(--color-text-muted)]">{evt.service}</span>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function VmLogPanel({ vmName }: { vmName: string }) {
  const [result, setResult] = useState<VmLogTailResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  // Guards against a stale response landing after `vmName` has already
  // moved on (e.g. the operator flips between VMs quickly).
  const activeVmRef = useRef(vmName);
  activeVmRef.current = vmName;

  const poll = useCallback(() => {
    const requestedVm = vmName;
    fetchVmLogs(vmName)
      .then((r) => {
        if (activeVmRef.current !== requestedVm) return;
        setResult(r);
        setError(null);
        setLoading(false);
      })
      .catch((e: unknown) => {
        if (activeVmRef.current !== requestedVm) return;
        setError(e instanceof Error ? e.message : "Failed to load logs");
        setLoading(false);
      });
  }, [vmName]);

  useEffect(() => {
    poll();
  }, [poll]);

  // Pauses while the tab is hidden; resumes with an immediate refresh.
  useVisibilityPausedInterval(poll, LOG_POLL_MS);

  return (
    <Card className="mt-2">
      <CardHeader>
        <CardTitle className="text-base">
          Log tail — <span className="font-mono text-sm">{vmName}</span>
        </CardTitle>
      </CardHeader>
      <CardContent>
        {error && <p className="text-sm text-red-600 mb-2">{error}</p>}
        {loading && !error ? (
          <p className="text-sm text-[var(--color-text-muted)] py-4 text-center">Loading…</p>
        ) : result && result.lines.length === 0 ? (
          <p className="text-sm text-[var(--color-text-muted)] py-4 text-center">No log lines available.</p>
        ) : result ? (
          <div data-testid="vm-log-feed" className="font-mono text-xs space-y-1 max-h-64 overflow-y-auto">
            {[...result.lines].reverse().map((line: VmLogLine, i: number) => (
              <div key={i} className="flex gap-2 items-start">
                <span className="text-[var(--color-text-muted)] shrink-0">
                  {new Date(line.timestamp).toLocaleTimeString()}
                </span>
                <span className={`shrink-0 font-semibold ${severityColor(line.severity)}`}>{line.event}</span>
                <span className="text-[var(--color-text-secondary)]">{line.message}</span>
              </div>
            ))}
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}

/**
 * LiveDeploymentsContent — the chrome-less live-ops surface (no `<main>`, no page `<h1>`)
 * so it renders standalone (the /ops/live-deployments page wraps it) OR folded inside the
 * cockpit Live tab. It does NOT read `?tab`/`?umbrella`, so it can't collide with the
 * cockpit's `?tab=` ownership.
 */
export function LiveDeploymentsContent() {
  const [rows, setRows] = useState<LiveServiceRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [lastRefreshed, setLastRefreshed] = useState<string>("");
  const [selectedVmName, setSelectedVmName] = useState<string | null>(null);
  const [activePanel, setActivePanel] = useState<"events" | "logs">("events");
  const [healthRefreshKey, setHealthRefreshKey] = useState(0);

  const load = useCallback(() => {
    setLoading(true);
    setError(null);
    fetchVmDeployments(1)
      .then((data) => {
        setRows(buildRows(data.active));
        setLastRefreshed(new Date().toLocaleTimeString());
        setHealthRefreshKey((k) => k + 1);
      })
      .catch((err: unknown) => {
        setError(err instanceof Error ? err.message : "Failed to load live deployments");
      })
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  // Pauses while the tab is hidden; resumes with an immediate refresh.
  useVisibilityPausedInterval(load, REFRESH_INTERVAL_MS);

  function toggleVm(vmName: string) {
    setSelectedVmName((prev) => {
      if (prev !== vmName) setActivePanel("events");
      return prev === vmName ? null : vmName;
    });
  }

  return (
    <div className="w-full" data-testid="live-deployments-content" aria-busy={loading}>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-semibold text-[var(--color-text-primary)]">Live Deployments</h1>
          <p className="text-sm text-[var(--color-text-muted)] mt-1">
            Services currently running in live mode — auto-refreshes every 30s
          </p>
        </div>
        <div className="flex items-center gap-3">
          {lastRefreshed && (
            <span aria-live="polite" aria-atomic="true" className="text-xs text-[var(--color-text-muted)]">
              Last updated: {lastRefreshed}
            </span>
          )}
          <Button
            variant="outline"
            size="sm"
            onClick={load}
            disabled={loading}
            aria-label="Refresh live deployments list"
          >
            {loading ? "Refreshing…" : "Refresh"}
          </Button>
        </div>
      </div>

      {error && (
        <div
          role="alert"
          className="mb-4 rounded-md bg-red-50 border border-red-200 p-3 text-sm text-red-700 flex items-center justify-between gap-3"
        >
          <span>{error}</span>
          <button
            aria-label="Retry loading live deployments"
            onClick={load}
            className="shrink-0 px-2 py-1 rounded text-xs border border-red-300 bg-white text-red-700 hover:bg-red-50"
          >
            Retry
          </button>
        </div>
      )}

      <Card>
        <CardHeader>
          <CardTitle className="text-base">
            Live-mode services{" "}
            <span className="text-[var(--color-text-muted)] font-normal">({rows.length} running)</span>
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {loading && rows.length === 0 ? (
            <div
              role="status"
              aria-label="Loading live deployments"
              className="space-y-2 p-4"
              data-testid="live-deployments-skeleton"
            >
              {Array.from({ length: 4 }, (_, i) => (
                <Skeleton key={i} className="h-8 w-full" />
              ))}
            </div>
          ) : rows.length === 0 ? (
            <div className="py-12 text-center text-sm text-[var(--color-text-muted)]">
              No services currently running in live mode.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm" aria-label="Live-mode VM deployments">
                <thead>
                  <tr className="border-b border-[var(--color-border)] bg-[var(--color-bg-secondary)]">
                    <th className="px-4 py-2 text-left font-medium text-[var(--color-text-muted)]">Service</th>
                    <th className="px-4 py-2 text-left font-medium text-[var(--color-text-muted)]">VM Name</th>
                    <th className="px-4 py-2 text-left font-medium text-[var(--color-text-muted)]">Asset Group</th>
                    <th className="px-4 py-2 text-left font-medium text-[var(--color-text-muted)]">Status</th>
                    <th className="px-4 py-2 text-left font-medium text-[var(--color-text-muted)]">Last STARTED</th>
                    <th className="px-4 py-2 text-left font-medium text-[var(--color-text-muted)]">Last Heartbeat</th>
                    <th className="px-4 py-2 text-left font-medium text-[var(--color-text-muted)]">Staleness</th>
                    <th className="px-4 py-2 text-left font-medium text-[var(--color-text-muted)]">Health</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map(({ entry, stalenessS }) => (
                    <tr
                      key={entry.deployment_id}
                      data-testid={`vm-row-${entry.vm_name}`}
                      onClick={() => toggleVm(entry.vm_name)}
                      className={`border-b border-[var(--color-border)] cursor-pointer hover:bg-[var(--color-bg-hover)] ${
                        selectedVmName === entry.vm_name ? "bg-[var(--color-bg-selected,#f0f4ff)]" : ""
                      }`}
                    >
                      <td className="px-4 py-3 font-medium text-[var(--color-text-primary)]">{entry.task}</td>
                      <td className="px-4 py-3 font-mono text-xs text-[var(--color-text-secondary)]">
                        {entry.vm_name}
                      </td>
                      <td className="px-4 py-3 text-[var(--color-text-secondary)]">{entry.asset_group}</td>
                      <td className="px-4 py-3">
                        <Badge variant="success">live</Badge>
                      </td>
                      <td className="px-4 py-3 text-[var(--color-text-secondary)]">{formatTs(entry.started_at)}</td>
                      <td className="px-4 py-3 text-[var(--color-text-secondary)]">
                        {formatTs(entry.last_heartbeat_at)}
                      </td>
                      <td className="px-4 py-3">
                        <Badge variant={stalenessVariant(stalenessS)}>{formatStaleness(stalenessS)}</Badge>
                      </td>
                      <td className="px-4 py-3">
                        <VmHealthBadge vmName={entry.vm_name} refreshKey={healthRefreshKey} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      {selectedVmName && (
        <>
          <div
            className="inline-flex items-center rounded-lg border border-[var(--color-border-default)] bg-[var(--color-bg-tertiary)] p-0.5 mt-4"
            role="tablist"
            aria-label="VM panel view"
          >
            <button
              role="tab"
              aria-selected={activePanel === "events"}
              onClick={() => setActivePanel("events")}
              className={`rounded-md px-2.5 py-1 text-xs font-medium transition-colors ${
                activePanel === "events"
                  ? "bg-[var(--color-accent-dim)] text-[var(--color-accent)]"
                  : "text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)]"
              }`}
            >
              Events
            </button>
            <button
              role="tab"
              aria-selected={activePanel === "logs"}
              onClick={() => setActivePanel("logs")}
              className={`rounded-md px-2.5 py-1 text-xs font-medium transition-colors ${
                activePanel === "logs"
                  ? "bg-[var(--color-accent-dim)] text-[var(--color-accent)]"
                  : "text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)]"
              }`}
            >
              Logs
            </button>
          </div>
          {activePanel === "events" ? <VmEventPanel vmName={selectedVmName} /> : <VmLogPanel vmName={selectedVmName} />}
        </>
      )}
    </div>
  );
}

/**
 * LiveDeployments — the standalone /ops/live-deployments page: a thin `<main>` shell around
 * the chrome-less {@link LiveDeploymentsContent}. The cockpit Live tab embeds the Content directly.
 */
export function LiveDeployments() {
  return (
    <main className="mx-auto px-4 lg:px-6 py-6 max-w-[1920px]">
      <LiveDeploymentsContent />
    </main>
  );
}
