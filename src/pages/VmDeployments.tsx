import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import {
  fetchVmDeployments,
  type VmDeploymentEntry,
} from "../api/deploymentApi";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "../components/ui/card";
import { Badge } from "../components/ui/badge";
import { Button } from "../components/ui/button";

const STATUS_VARIANT: Record<
  string,
  "success" | "warning" | "error" | "default"
> = {
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

export function VmDeployments(): JSX.Element {
  const [active, setActive] = useState<VmDeploymentEntry[]>([]);
  const [recent, setRecent] = useState<VmDeploymentEntry[]>([]);
  const [days, setDays] = useState(7);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [lastRefreshed, setLastRefreshed] = useState<string>("");

  const load = useCallback(() => {
    setLoading(true);
    setError(null);
    fetchVmDeployments(days)
      .then((data) => {
        setActive(data.active);
        setRecent(data.recent);
        setLastRefreshed(new Date().toLocaleTimeString());
      })
      .catch((err: unknown) =>
        setError(
          err instanceof Error ? err.message : "Failed to load VM deployments",
        ),
      )
      .finally(() => setLoading(false));
  }, [days]);

  useEffect(() => {
    load();
    const timer = window.setInterval(load, 30_000); // auto-refresh 30s
    return () => window.clearInterval(timer);
  }, [load]);

  const renderTable = (
    rows: VmDeploymentEntry[],
    heading: string,
    count: number,
  ) => (
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
                <th className="table-header-cell">Deployment</th>
                <th className="table-header-cell">Name</th>
                <th className="table-header-cell">Category</th>
                <th className="table-header-cell">Task / Mode</th>
                <th className="table-header-cell">Status</th>
                <th className="table-header-cell">Progress</th>
                <th className="table-header-cell text-right">Errors</th>
                <th className="table-header-cell">Started</th>
                <th className="table-header-cell">Last Heartbeat</th>
                <th className="table-header-cell"></th>
              </tr>
            </thead>
            <tbody>
              {rows.length === 0 ? (
                <tr>
                  <td
                    colSpan={10}
                    className="table-cell text-center text-[var(--color-text-muted)] py-6"
                  >
                    None
                  </td>
                </tr>
              ) : (
                rows.map((r) => (
                  <tr key={r.deployment_id} className="table-row">
                    <td className="table-cell font-mono text-xs">
                      {r.deployment_id.slice(0, 8)}…
                    </td>
                    <td className="table-cell font-semibold text-xs">
                      {r.vm_name}
                    </td>
                    <td className="table-cell">{r.category}</td>
                    <td className="table-cell text-xs">
                      {r.task} / {r.mode}
                    </td>
                    <td className="table-cell">
                      <Badge
                        variant={STATUS_VARIANT[r.status] ?? "default"}
                        data-testid={`status-${r.status}`}
                      >
                        {r.status}
                      </Badge>
                      {r.exit_code != null && (
                        <span className="text-[var(--color-text-muted)] text-xs ml-2">
                          rc={r.exit_code}
                        </span>
                      )}
                    </td>
                    <td
                      className="table-cell font-mono text-xs"
                      style={{ fontVariantNumeric: "tabular-nums" }}
                    >
                      {formatProgress(r)}
                    </td>
                    <td
                      className={
                        "table-cell text-right font-mono text-xs " +
                        (r.rows_error > 0
                          ? "text-[var(--color-error)]"
                          : "text-[var(--color-text-muted)]")
                      }
                      style={{ fontVariantNumeric: "tabular-nums" }}
                    >
                      {r.rows_error.toLocaleString()}
                    </td>
                    <td
                      className="table-cell text-xs text-[var(--color-text-muted)]"
                      style={{ fontVariantNumeric: "tabular-nums" }}
                    >
                      {formatTimestamp(r.started_at)}
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
                        Events
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

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-base font-semibold text-[var(--color-text-primary)]">
            VM Deployments
          </h1>
          <p className="text-xs text-[var(--color-text-tertiary)] mt-0.5">
            Active VM jobs + last {days} days of completions — sourced from the
            GCS deployments registry.
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
            <span
              className="text-xs text-[var(--color-text-muted)]"
              style={{ fontVariantNumeric: "tabular-nums" }}
            >
              refreshed {lastRefreshed}
            </span>
          )}
          <Button
            variant="outline"
            size="sm"
            onClick={load}
            disabled={loading}
          >
            Refresh
          </Button>
        </div>
      </div>

      {error && (
        <div className="text-[var(--color-error)] text-sm py-2">
          Error: {error}
        </div>
      )}

      {renderTable(active, "Active", active.length)}
      {renderTable(recent, `Recent (${days}d)`, recent.length)}
    </div>
  );
}
