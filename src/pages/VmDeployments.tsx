import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import {
  fetchVmDeployments,
  reconcileVmDeployments,
  type VmDeploymentEntry,
  type VmReconcileResult,
} from "../api/deploymentApi";
import { Badge } from "../components/ui/badge";
import { Button } from "../components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "../components/ui/card";
import { VenueCredentialsPanel } from "../components/VenueCredentialsPanel";
import { VenueDateRangePanel } from "../components/VenueDateRangePanel";
import { VenueRelaunchEstimatePanel } from "../components/VenueRelaunchEstimatePanel";
import { VenueTardisWindowsPanel } from "../components/VenueTardisWindowsPanel";

const STATUS_VARIANT: Record<string, "success" | "warning" | "error" | "default"> = {
  running: "warning",
  completed: "success",
  failed: "error",
};

function formatProgress(entry: VmDeploymentEntry): string {
  const total = entry.rows_in;
  const done = entry.rows_out + entry.rows_error;
  if (total <= 0) {
    return done > 0 ? `${done.toLocaleString()} rows` : "—";
  }
  const pct = Math.min(100, Math.round((done / total) * 100));
  return `${pct}% (${done.toLocaleString()}/${total.toLocaleString()})`;
}

function formatUptime(hours: number | null | undefined): string {
  if (!hours) return "—";
  if (hours < 1) return `${Math.round(hours * 60)}m`;
  if (hours < 24) return `${hours.toFixed(1)}h`;
  return `${Math.floor(hours / 24)}d ${Math.round(hours % 24)}h`;
}

function getHealthBadgeVariant(status: string | undefined): "success" | "warning" | "error" | "default" {
  switch (status) {
    case "producing":
      return "success";
    case "starting":
    case "idle":
      return "warning";
    case "stalled":
    case "stopped":
    case "boot-hung":
      return "error";
    default:
      return "default";
  }
}

function formatTimestamp(value: string | null): string {
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

function formatDuration(startedAt: string, completedAt: string | null): string {
  if (!completedAt) return "—";
  try {
    const ms = new Date(completedAt).getTime() - new Date(startedAt).getTime();
    if (ms < 0) return "—";
    const totalMin = Math.floor(ms / 60_000);
    const hours = Math.floor(totalMin / 60);
    const mins = totalMin % 60;
    if (hours > 0) return `${hours}h ${mins}m`;
    return `${totalMin}m`;
  } catch {
    return "—";
  }
}

function getOutcomeVariant(status: string, exitCode: number | null): "success" | "warning" | "error" | "default" {
  if (status === "completed" && (exitCode === null || exitCode === 0)) return "success";
  if (status === "failed" || (exitCode !== null && exitCode !== 0)) return "error";
  if (status === "reaped") return "warning";
  return "default";
}

function getOutcomeLabel(status: string, exitCode: number | null): string {
  if (status === "completed" && (exitCode === null || exitCode === 0)) return "COMPLETED";
  if (status === "failed") return exitCode !== null ? `FAILED (rc=${exitCode})` : "FAILED";
  if (status === "reaped") return "reaped";
  if (exitCode !== null && exitCode !== 0) return `${status.toUpperCase()} (rc=${exitCode})`;
  return status.toUpperCase();
}

function logUriToConsoleUrl(logUri: string): string | null {
  if (!logUri || !logUri.startsWith("gs://")) return null;
  const withoutScheme = logUri.slice(5);
  const slashIdx = withoutScheme.indexOf("/");
  if (slashIdx === -1) return null;
  const bucket = withoutScheme.slice(0, slashIdx);
  const path = withoutScheme.slice(slashIdx + 1);
  return `https://console.cloud.google.com/storage/browser/_details/${bucket}/${path}`;
}

/**
 * VmDeploymentsContent — the chrome-less VM census (active + archive tables + venue
 * panels). Rendered standalone by {@link VmDeployments} (its own page) OR embedded in
 * the cockpit Fleet tab. No router hooks here so embedding can't collide with the
 * cockpit's `?tab=` ownership. `compact` hides the venue-config panels (only the
 * active/archive census matters in the Fleet tab).
 */
export function VmDeploymentsContent({ compact = false }: { compact?: boolean } = {}) {
  const [active, setActive] = useState<VmDeploymentEntry[]>([]);
  const [recent, setRecent] = useState<VmDeploymentEntry[]>([]);
  const [days, setDays] = useState(7);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [lastRefreshed, setLastRefreshed] = useState<string>("");
  const [reconciling, setReconciling] = useState(false);
  const [reconcileResult, setReconcileResult] = useState<VmReconcileResult | null>(null);
  const [reconcileError, setReconcileError] = useState<string | null>(null);

  const load = useCallback(() => {
    setLoading(true);
    setError(null);
    fetchVmDeployments(days)
      .then((data) => {
        setActive(data.active);
        setRecent(data.recent);
        setLastRefreshed(new Date().toLocaleTimeString());
      })
      .catch((err: unknown) => setError(err instanceof Error ? err.message : "Failed to load VM deployments"))
      .finally(() => setLoading(false));
  }, [days]);

  const reconcile = useCallback(() => {
    setReconciling(true);
    setReconcileResult(null);
    setReconcileError(null);
    reconcileVmDeployments()
      .then((result) => {
        setReconcileResult(result);
        // Reload the list to reflect reaped entries.
        setLoading(true);
        setError(null);
        fetchVmDeployments(days)
          .then((data) => {
            setActive(data.active);
            setRecent(data.recent);
            setLastRefreshed(new Date().toLocaleTimeString());
          })
          .catch((err: unknown) => setError(err instanceof Error ? err.message : "Failed to load VM deployments"))
          .finally(() => setLoading(false));
      })
      .catch((err: unknown) => setReconcileError(err instanceof Error ? err.message : "Reconcile failed"))
      .finally(() => setReconciling(false));
  }, [days]);

  useEffect(() => {
    load();
    const timer = window.setInterval(load, 30_000); // auto-refresh 30s
    return () => window.clearInterval(timer);
  }, [load]);

  const renderTable = (rows: VmDeploymentEntry[], heading: string, count: number) => (
    <Card className="rounded-lg">
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle>{heading}</CardTitle>
          <Badge variant="info">{count}</Badge>
        </div>
      </CardHeader>
      <CardContent className="p-0">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr>
                <th className="table-header-cell">Name</th>
                <th className="table-header-cell">Machine Type</th>
                <th className="table-header-cell">Zone</th>
                <th className="table-header-cell">Asset Group</th>
                <th className="table-header-cell">Task</th>
                <th className="table-header-cell">Health</th>
                <th className="table-header-cell">Progress</th>
                <th className="table-header-cell text-right">Errors</th>
                <th className="table-header-cell">Uptime</th>
                <th className="table-header-cell">Last Activity</th>
                <th className="table-header-cell"></th>
              </tr>
            </thead>
            <tbody>
              {rows.length === 0 ? (
                <tr>
                  <td colSpan={10} className="table-cell text-center text-[var(--color-text-muted)] py-6">
                    None
                  </td>
                </tr>
              ) : (
                rows.map((r) => (
                  <tr key={r.deployment_id} className="table-row">
                    <td className="table-cell font-semibold text-xs">
                      <div title={`ID: ${r.deployment_id}`}>{r.vm_name}</div>
                    </td>
                    <td className="table-cell text-xs">{r.machine_type || "—"}</td>
                    <td className="table-cell text-xs">{r.zone || "—"}</td>
                    <td className="table-cell">{r.asset_group}</td>
                    <td className="table-cell text-xs">
                      <div>{r.task}</div>
                      <div className="text-[var(--color-text-muted)]">{r.mode}</div>
                    </td>
                    <td className="table-cell">
                      {r.health_status ? (
                        <Badge
                          variant={getHealthBadgeVariant(r.health_status)}
                          data-testid={`health-${r.health_status}`}
                        >
                          {r.health_status}
                        </Badge>
                      ) : (
                        <Badge variant={STATUS_VARIANT[r.status] ?? "default"} data-testid={`status-${r.status}`}>
                          {r.status}
                        </Badge>
                      )}
                      {r.exit_code != null && (
                        <span className="text-[var(--color-text-muted)] text-xs ml-2">rc={r.exit_code}</span>
                      )}
                    </td>
                    <td className="table-cell font-mono text-xs" style={{ fontVariantNumeric: "tabular-nums" }}>
                      {formatProgress(r)}
                    </td>
                    <td
                      className={
                        "table-cell text-right font-mono text-xs " +
                        (r.rows_error > 0 ? "text-[var(--color-error)]" : "text-[var(--color-text-muted)]")
                      }
                      style={{ fontVariantNumeric: "tabular-nums" }}
                    >
                      {r.rows_error.toLocaleString()}
                    </td>
                    <td
                      className="table-cell text-xs text-[var(--color-text-muted)]"
                      style={{ fontVariantNumeric: "tabular-nums" }}
                    >
                      {formatUptime(r.uptime_hours)}
                    </td>
                    <td
                      className="table-cell text-xs text-[var(--color-text-muted)]"
                      style={{ fontVariantNumeric: "tabular-nums" }}
                    >
                      {formatTimestamp(r.last_heartbeat_at)}
                    </td>
                    <td className="table-cell">
                      <Link
                        to={`/vm-deployments/${encodeURIComponent(r.deployment_id)}`}
                        className="text-xs text-[var(--color-accent-blue)] hover:underline"
                      >
                        Details
                      </Link>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </CardContent>
    </Card>
  );

  const renderArchiveTable = (rows: VmDeploymentEntry[], heading: string, count: number) => (
    <Card className="rounded-lg">
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle>{heading}</CardTitle>
          <Badge variant="info">{count}</Badge>
        </div>
      </CardHeader>
      <CardContent className="p-0">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr>
                <th className="table-header-cell">Name</th>
                <th className="table-header-cell">Asset Group</th>
                <th className="table-header-cell">Task</th>
                <th className="table-header-cell">Outcome</th>
                <th className="table-header-cell">Duration</th>
                <th className="table-header-cell text-right">Rows Captured</th>
                <th className="table-header-cell">Completed</th>
                <th className="table-header-cell">Archive</th>
                <th className="table-header-cell"></th>
              </tr>
            </thead>
            <tbody>
              {rows.length === 0 ? (
                <tr>
                  <td colSpan={9} className="table-cell text-center text-[var(--color-text-muted)] py-6">
                    None
                  </td>
                </tr>
              ) : (
                rows.map((r) => {
                  // Prefer durable archive URI (log-archive/rolling/ — no TTL) over live stream (vm-logs/ — 14-day TTL).
                  const archiveRunLogUrl = logUriToConsoleUrl(r.archive_run_log_uri || "");
                  const archiveSerialUrl = logUriToConsoleUrl(r.archive_serial_uri || "");
                  const fallbackLogUrl = archiveRunLogUrl ?? logUriToConsoleUrl(r.log_uri);
                  return (
                    <tr key={r.deployment_id} className="table-row" data-testid={`archive-row-${r.deployment_id}`}>
                      <td className="table-cell font-semibold text-xs">
                        <div title={`ID: ${r.deployment_id}`}>{r.vm_name}</div>
                      </td>
                      <td className="table-cell">{r.asset_group}</td>
                      <td className="table-cell text-xs">
                        <div>{r.task}</div>
                        <div className="text-[var(--color-text-muted)]">{r.mode}</div>
                      </td>
                      <td className="table-cell">
                        <Badge
                          variant={getOutcomeVariant(r.status, r.exit_code)}
                          data-testid={`outcome-${r.deployment_id}`}
                        >
                          {getOutcomeLabel(r.status, r.exit_code)}
                        </Badge>
                      </td>
                      <td
                        className="table-cell text-xs text-[var(--color-text-muted)]"
                        style={{ fontVariantNumeric: "tabular-nums" }}
                        data-testid={`duration-${r.deployment_id}`}
                      >
                        {formatDuration(r.started_at, r.completed_at)}
                      </td>
                      <td
                        className="table-cell text-right font-mono text-xs"
                        style={{ fontVariantNumeric: "tabular-nums" }}
                        data-testid={`rows-captured-${r.deployment_id}`}
                      >
                        {r.rows_out > 0 ? r.rows_out.toLocaleString() : "—"}
                      </td>
                      <td
                        className="table-cell text-xs text-[var(--color-text-muted)]"
                        style={{ fontVariantNumeric: "tabular-nums" }}
                      >
                        {formatTimestamp(r.completed_at)}
                      </td>
                      <td className="table-cell text-xs">
                        <div className="flex items-center gap-2">
                          {fallbackLogUrl ? (
                            <a
                              href={fallbackLogUrl}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="text-[var(--color-accent-blue)] hover:underline font-mono"
                              title={r.archive_run_log_uri || r.log_uri}
                              data-testid={`log-link-${r.deployment_id}`}
                            >
                              run.log
                            </a>
                          ) : (
                            <span className="text-[var(--color-text-muted)]">—</span>
                          )}
                          {archiveSerialUrl && (
                            <a
                              href={archiveSerialUrl}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="text-[var(--color-accent-blue)] hover:underline font-mono"
                              title={r.archive_serial_uri}
                              data-testid={`serial-link-${r.deployment_id}`}
                            >
                              serial
                            </a>
                          )}
                        </div>
                      </td>
                      <td className="table-cell">
                        <Link
                          to={`/vm-deployments/${encodeURIComponent(r.deployment_id)}`}
                          className="text-xs text-[var(--color-accent-blue)] hover:underline"
                        >
                          Details
                        </Link>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </CardContent>
    </Card>
  );

  return (
    <div className="space-y-6" data-testid="vm-deployments-content">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-base font-semibold text-[var(--color-text-primary)]">VM Deployments</h1>
          <p className="text-xs text-[var(--color-text-tertiary)] mt-0.5">
            Active VM jobs + last {days} days of completions — sourced from the GCS deployments registry.
          </p>
        </div>
        <div className="flex items-center gap-3">
          <label className="text-xs text-[var(--color-text-muted)]">
            Archive window:
            <select
              className="ml-2 bg-[var(--color-bg-secondary)] text-[var(--color-text-primary)] border border-[var(--color-border)] rounded px-2 py-1 text-xs"
              value={days}
              onChange={(e) => setDays(Number(e.target.value))}
            >
              <option value={1}>1d</option>
              <option value={3}>3d</option>
              <option value={7}>7d</option>
              <option value={14}>14d</option>
            </select>
          </label>
          {lastRefreshed && (
            <span className="text-xs text-[var(--color-text-muted)]" style={{ fontVariantNumeric: "tabular-nums" }}>
              refreshed {lastRefreshed}
            </span>
          )}
          <Button
            variant="outline"
            size="sm"
            onClick={reconcile}
            disabled={reconciling || loading}
            data-testid="reconcile-registry-btn"
          >
            {reconciling ? "Reconciling…" : "Reconcile Registry"}
          </Button>
          <Button variant="outline" size="sm" onClick={load} disabled={loading}>
            Refresh
          </Button>
        </div>
      </div>

      {reconcileResult && (
        <div className="text-xs text-[var(--color-text-muted)] py-1" data-testid="reconcile-result">
          Reconciled: reaped {reconcileResult.reaped_count} stale entries ({reconcileResult.total_active_before} active
          before, {reconcileResult.running_vm_count} VMs running in GCP)
        </div>
      )}
      {reconcileError && (
        <div className="text-[var(--color-error)] text-xs py-1" data-testid="reconcile-error">
          Reconcile error: {reconcileError}
        </div>
      )}

      {error && <div className="text-[var(--color-error)] text-sm py-2">Error: {error}</div>}

      {!compact && (
        <>
          <VenueCredentialsPanel />
          <VenueDateRangePanel />
          <VenueRelaunchEstimatePanel />
          <VenueTardisWindowsPanel />
        </>
      )}
      {renderTable(active, "Active", active.length)}
      {renderArchiveTable(recent, `Recent (${days}d)`, recent.length)}
    </div>
  );
}

/**
 * VmDeployments — the standalone /vm-deployments page: a `<main>`-grade `<div>` shell
 * (the original `p-6` page padding) around {@link VmDeploymentsContent}.
 */
export function VmDeployments() {
  return (
    <div className="p-6">
      <VmDeploymentsContent />
    </div>
  );
}
