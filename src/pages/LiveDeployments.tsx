import { useCallback, useEffect, useState } from "react";
import { fetchVmDeployments, type VmDeploymentEntry } from "../api/deploymentApi";
import { Badge } from "../components/ui/badge";
import { Button } from "../components/ui/button";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "../components/ui/card";

const REFRESH_INTERVAL_MS = 30_000;

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

export function LiveDeployments() {
  const [rows, setRows] = useState<LiveServiceRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [lastRefreshed, setLastRefreshed] = useState<string>("");

  const load = useCallback(() => {
    setLoading(true);
    setError(null);
    fetchVmDeployments(1)
      .then((data) => {
        setRows(buildRows(data.active));
        setLastRefreshed(new Date().toLocaleTimeString());
      })
      .catch((err: unknown) => {
        setError(err instanceof Error ? err.message : "Failed to load live deployments");
      })
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    load();
    const id = setInterval(load, REFRESH_INTERVAL_MS);
    return () => clearInterval(id);
  }, [load]);

  return (
    <main className="mx-auto px-4 lg:px-6 py-6 max-w-[1920px]">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-semibold text-[var(--color-text-primary)]">
            Live Deployments
          </h1>
          <p className="text-sm text-[var(--color-text-muted)] mt-1">
            Services currently running in live mode — auto-refreshes every 30s
          </p>
        </div>
        <div className="flex items-center gap-3">
          {lastRefreshed && (
            <span className="text-xs text-[var(--color-text-muted)]">
              Last updated: {lastRefreshed}
            </span>
          )}
          <Button variant="outline" size="sm" onClick={load} disabled={loading}>
            {loading ? "Refreshing…" : "Refresh"}
          </Button>
        </div>
      </div>

      {error && (
        <div className="mb-4 rounded-md bg-red-50 border border-red-200 p-3 text-sm text-red-700">
          {error}
        </div>
      )}

      <Card>
        <CardHeader>
          <CardTitle className="text-base">
            Live-mode services{" "}
            <span className="text-[var(--color-text-muted)] font-normal">
              ({rows.length} running)
            </span>
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {loading && rows.length === 0 ? (
            <div className="py-12 text-center text-sm text-[var(--color-text-muted)]">
              Loading…
            </div>
          ) : rows.length === 0 ? (
            <div className="py-12 text-center text-sm text-[var(--color-text-muted)]">
              No services currently running in live mode.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-[var(--color-border)] bg-[var(--color-bg-secondary)]">
                    <th className="px-4 py-2 text-left font-medium text-[var(--color-text-muted)]">
                      Service
                    </th>
                    <th className="px-4 py-2 text-left font-medium text-[var(--color-text-muted)]">
                      VM Name
                    </th>
                    <th className="px-4 py-2 text-left font-medium text-[var(--color-text-muted)]">
                      Asset Group
                    </th>
                    <th className="px-4 py-2 text-left font-medium text-[var(--color-text-muted)]">
                      Status
                    </th>
                    <th className="px-4 py-2 text-left font-medium text-[var(--color-text-muted)]">
                      Last STARTED
                    </th>
                    <th className="px-4 py-2 text-left font-medium text-[var(--color-text-muted)]">
                      Last Heartbeat
                    </th>
                    <th className="px-4 py-2 text-left font-medium text-[var(--color-text-muted)]">
                      Staleness
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map(({ entry, stalenessS }) => (
                    <tr
                      key={entry.deployment_id}
                      className="border-b border-[var(--color-border)] hover:bg-[var(--color-bg-hover)]"
                    >
                      <td className="px-4 py-3 font-medium text-[var(--color-text-primary)]">
                        {entry.task}
                      </td>
                      <td className="px-4 py-3 font-mono text-xs text-[var(--color-text-secondary)]">
                        {entry.vm_name}
                      </td>
                      <td className="px-4 py-3 text-[var(--color-text-secondary)]">
                        {entry.asset_group}
                      </td>
                      <td className="px-4 py-3">
                        <Badge variant="success">live</Badge>
                      </td>
                      <td className="px-4 py-3 text-[var(--color-text-secondary)]">
                        {formatTs(entry.started_at)}
                      </td>
                      <td className="px-4 py-3 text-[var(--color-text-secondary)]">
                        {formatTs(entry.last_heartbeat_at)}
                      </td>
                      <td className="px-4 py-3">
                        <Badge variant={stalenessVariant(stalenessS)}>
                          {formatStaleness(stalenessS)}
                        </Badge>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </main>
  );
}
