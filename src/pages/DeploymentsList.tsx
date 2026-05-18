import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { fetchDeploymentDiff, fetchServices } from "../api/deploymentApi";
import type {
  DeploymentDiffResponse,
  DiffEntry,
} from "../api/deploymentApi";
import type { ServiceStatus, ServiceHealth } from "../types/deploymentTypes";
import { Card, CardContent, CardHeader, CardTitle } from "../components/ui/card";
import { Badge } from "../components/ui/badge";
import { Button } from "../components/ui/button";
import {
  BTN_COMPARE,
  BTN_COMPARING,
  BTN_COMPARE_SHAS,
  BTN_HIDE_DIFF,
  ERR_FAILED_TO_FETCH_DIFF,
  ERR_FAILED_TO_LOAD_SERVICES,
  LABEL_DEGRADED,
  LABEL_HEALTHY,
  LABEL_LAST_DEPLOY,
  LABEL_TOTAL_SERVICES,
} from "../lib/strings";

const HEALTH_VARIANT: Record<
  ServiceHealth,
  "success" | "warning" | "error" | "default"
> = {
  HEALTHY: "success",
  DEGRADED: "warning",
  UNHEALTHY: "error",
  UNKNOWN: "default",
};

function formatTimestamp(): string {
  return new Date().toLocaleString([], {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
}

function diffRowClass(kind: "added" | "removed" | "changed"): string {
  if (kind === "added") return "bg-green-50 text-green-800";
  if (kind === "removed") return "bg-red-50 text-red-800";
  return "bg-amber-50 text-amber-800";
}

function DiffSection({
  title,
  entries,
  kind,
}: {
  title: string;
  entries: DiffEntry[];
  kind: "added" | "removed" | "changed";
}) {
  if (entries.length === 0) return null;
  return (
    <div className="mb-3">
      <div className={`text-xs font-semibold px-3 py-1 rounded-t ${diffRowClass(kind)}`}>
        {title} ({entries.length})
      </div>
      <table className="w-full text-xs border border-t-0 rounded-b overflow-hidden">
        <thead className="bg-[var(--color-bg-secondary)]">
          <tr>
            <th className="px-3 py-1 text-left font-medium text-[var(--color-text-muted)]">Service</th>
            <th className="px-3 py-1 text-left font-medium text-[var(--color-text-muted)]">From</th>
            <th className="px-3 py-1 text-left font-medium text-[var(--color-text-muted)]">To</th>
          </tr>
        </thead>
        <tbody>
          {entries.map((e) => (
            <tr key={e.service} className="border-t border-[var(--color-border)]">
              <td className="px-3 py-1 font-mono">{e.service}</td>
              <td className="px-3 py-1 font-mono text-[var(--color-text-muted)]">
                {e.from_version ?? "—"}
              </td>
              <td className="px-3 py-1 font-mono text-[var(--color-text-muted)]">
                {e.to_version ?? "—"}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function DeploymentDiffPanel() {
  const [fromSha, setFromSha] = useState("");
  const [toSha, setToSha] = useState("");
  const [result, setResult] = useState<DeploymentDiffResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function handleCompare(e: React.FormEvent) {
    e.preventDefault();
    if (!fromSha.trim() || !toSha.trim()) return;
    setLoading(true);
    setError(null);
    setResult(null);
    fetchDeploymentDiff(fromSha.trim(), toSha.trim())
      .then((r) => { setResult(r); setLoading(false); })
      .catch((err: unknown) => {
        setError(err instanceof Error ? err.message : ERR_FAILED_TO_FETCH_DIFF);
        setLoading(false);
      });
  }

  return (
    <Card className="rounded-lg mt-4">
      <CardHeader>
        <CardTitle>Deployment Diff</CardTitle>
      </CardHeader>
      <CardContent>
        <form
          onSubmit={handleCompare}
          data-testid="diff-form"
          className="flex flex-wrap gap-3 items-end mb-4"
        >
          <div className="flex flex-col gap-1">
            <label className="text-xs text-[var(--color-text-muted)]" htmlFor="diff-from-sha">
              From SHA
            </label>
            <input
              id="diff-from-sha"
              data-testid="diff-from-sha"
              type="text"
              value={fromSha}
              onChange={(e) => setFromSha(e.target.value)}
              placeholder="e.g. abc1234"
              className="px-2 py-1 text-sm font-mono border border-[var(--color-border)] rounded focus:outline-none focus:ring-1 focus:ring-blue-400 w-40"
            />
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-xs text-[var(--color-text-muted)]" htmlFor="diff-to-sha">
              To SHA
            </label>
            <input
              id="diff-to-sha"
              data-testid="diff-to-sha"
              type="text"
              value={toSha}
              onChange={(e) => setToSha(e.target.value)}
              placeholder="e.g. def5678"
              className="px-2 py-1 text-sm font-mono border border-[var(--color-border)] rounded focus:outline-none focus:ring-1 focus:ring-blue-400 w-40"
            />
          </div>
          <Button type="submit" variant="outline" size="sm" disabled={loading || !fromSha || !toSha}>
            {loading ? BTN_COMPARING : BTN_COMPARE}
          </Button>
        </form>

        {error && (
          <p className="text-sm text-red-600 mb-3" data-testid="diff-error">{error}</p>
        )}

        {result && (
          <div data-testid="diff-result">
            {result.total_changes === 0 ? (
              <p className="text-sm text-[var(--color-text-muted)]">No changes between these SHAs.</p>
            ) : (
              <>
                <DiffSection title="Added" entries={result.added} kind="added" />
                <DiffSection title="Removed" entries={result.removed} kind="removed" />
                <DiffSection title="Changed" entries={result.changed} kind="changed" />
              </>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

export function DeploymentsList() {
  const [services, setServices] = useState<ServiceStatus[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [lastRefreshed, setLastRefreshed] = useState(formatTimestamp());
  const [showDiff, setShowDiff] = useState(false);

  const load = () => {
    setLoading(true);
    fetchServices()
      .then((data) => {
        setServices(data);
        setLastRefreshed(formatTimestamp());
      })
      .catch((err: unknown) =>
        setError(
          err instanceof Error ? err.message : ERR_FAILED_TO_LOAD_SERVICES,
        ),
      )
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    load();
  }, []);

  const healthy = services.filter((s) => s.health === "HEALTHY").length;
  const total = services.length;
  const degraded = services.filter((s) => s.health === "DEGRADED").length;
  const lastDeploy =
    services.length > 0
      ? new Date(
          Math.max(
            ...services.map((s) => new Date(s.last_deployed_at).getTime()),
          ),
        ).toLocaleString([], {
          month: "short",
          day: "numeric",
          hour: "2-digit",
          minute: "2-digit",
        })
      : "--";

  if (loading)
    return (
      <div className="p-6 text-[var(--color-text-muted)] font-mono">
        Loading services...
      </div>
    );

  return (
    <div className="p-6 space-y-6">
      {/* Header with timestamp */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-base font-semibold text-[var(--color-text-primary)]">
            Deployments
          </h1>
          <p className="text-xs text-[var(--color-text-tertiary)] mt-0.5">
            Service health, versions & deployment history
          </p>
        </div>
        <div className="flex items-center gap-3">
          <span
            data-testid="deploy-timestamp"
            className="text-xs text-[var(--color-text-muted)]"
            style={{ fontVariantNumeric: "tabular-nums" }}
          >
            {lastRefreshed}
          </span>
          <Button variant="outline" size="sm" onClick={load}>
            Refresh
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => setShowDiff((v) => !v)}
            data-testid="toggle-diff-btn"
          >
            {showDiff ? BTN_HIDE_DIFF : BTN_COMPARE_SHAS}
          </Button>
          <Link
            to="/deploy"
            className="inline-flex items-center px-3 py-1.5 text-xs font-medium rounded-lg bg-[var(--color-accent-blue)] text-white hover:opacity-90 transition-opacity"
          >
            + Deploy
          </Link>
        </div>
      </div>

      {error && (
        <div className="text-[var(--color-error)] text-sm py-2">
          Error: {error}
        </div>
      )}

      {/* KPI Cards */}
      <div
        data-testid="kpi-grid"
        className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5"
      >
        {[
          {
            label: LABEL_TOTAL_SERVICES,
            value: String(total),
            accent: "var(--color-accent-blue)",
          },
          {
            label: LABEL_HEALTHY,
            value: `${healthy}/${total}`,
            accent:
              healthy === total
                ? "var(--color-accent-green)"
                : "var(--color-accent-amber)",
          },
          {
            label: LABEL_DEGRADED,
            value: String(degraded),
            accent:
              degraded > 0
                ? "var(--color-accent-red)"
                : "var(--color-accent-green)",
          },
          {
            label: LABEL_LAST_DEPLOY,
            value: lastDeploy,
            accent: "var(--color-accent-purple)",
          },
        ].map(({ label, value, accent }) => (
          <Card
            key={label}
            data-testid={`kpi-card-${label.toLowerCase().replace(/\s+/g, "-")}`}
            className="rounded-lg"
          >
            <CardContent className="pt-4 pb-4">
              <div className="flex items-stretch gap-3">
                <div
                  className="w-1 rounded-full flex-shrink-0"
                  style={{ backgroundColor: accent }}
                />
                <div>
                  <div className="text-xs text-[var(--color-text-muted)] mb-1">
                    {label}
                  </div>
                  <div
                    className="text-xl font-semibold font-mono text-[var(--color-text-primary)]"
                    style={{ fontVariantNumeric: "tabular-nums" }}
                  >
                    {value}
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Services Table */}
      {services.length === 0 ? (
        <p className="text-[var(--color-text-muted)] text-sm">
          No services found.
        </p>
      ) : (
        <Card className="rounded-lg">
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle>Services</CardTitle>
              <Badge variant="info">{total}</Badge>
            </div>
          </CardHeader>
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr>
                    <th className="table-header-cell">Service</th>
                    <th className="table-header-cell">Health</th>
                    <th className="table-header-cell text-right">Version</th>
                    <th className="table-header-cell">Env</th>
                    <th className="table-header-cell text-right">Replicas</th>
                    <th className="table-header-cell">Last Deploy</th>
                    <th className="table-header-cell"></th>
                  </tr>
                </thead>
                <tbody>
                  {services.map((svc) => (
                    <tr key={svc.service_id} className="table-row">
                      <td className="table-cell font-semibold">{svc.name}</td>
                      <td className="table-cell">
                        <Badge variant={HEALTH_VARIANT[svc.health]}>
                          {svc.health}
                        </Badge>
                      </td>
                      <td
                        className="table-cell text-right font-mono text-[var(--color-text-muted)]"
                        style={{ fontVariantNumeric: "tabular-nums" }}
                      >
                        {svc.current_version}
                      </td>
                      <td className="table-cell text-[var(--color-text-muted)]">
                        {svc.environment}
                      </td>
                      <td
                        className="table-cell text-right font-mono"
                        style={{ fontVariantNumeric: "tabular-nums" }}
                      >
                        <span
                          className={
                            svc.replicas_ready < svc.replicas_total
                              ? "text-[var(--color-warning)]"
                              : "text-[var(--color-success)]"
                          }
                        >
                          {svc.replicas_ready}/{svc.replicas_total}
                        </span>
                      </td>
                      <td
                        className="table-cell text-xs text-[var(--color-text-muted)]"
                        style={{ fontVariantNumeric: "tabular-nums" }}
                      >
                        {new Date(svc.last_deployed_at).toLocaleString()}
                      </td>
                      <td className="table-cell">
                        <Link
                          to={`/history?service=${svc.service_id}`}
                          className="text-xs text-[var(--color-accent-blue)] hover:underline"
                        >
                          History
                        </Link>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      )}

      {showDiff && <DeploymentDiffPanel />}
    </div>
  );
}
