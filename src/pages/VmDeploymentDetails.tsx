import { useCallback, useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import {
  fetchVmDeployment,
  fetchVmDeploymentEvents,
  type VmDeploymentEntry,
  type DeploymentEventsResponse,
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

function formatValue(v: unknown): string {
  if (v === null || v === undefined) return "—";
  if (typeof v === "string") return v;
  if (typeof v === "number" || typeof v === "boolean") return String(v);
  try {
    return JSON.stringify(v);
  } catch {
    return String(v);
  }
}

export function VmDeploymentDetails() {
  const { deploymentId = "" } = useParams<{ deploymentId: string }>();
  const [entry, setEntry] = useState<VmDeploymentEntry | null>(null);
  const [events, setEvents] = useState<DeploymentEventsResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(() => {
    setLoading(true);
    setError(null);
    Promise.all([
      fetchVmDeployment(deploymentId),
      fetchVmDeploymentEvents(deploymentId).catch(
        () => ({ deployment_id: deploymentId, events: [], count: 0 }),
      ),
    ])
      .then(([e, ev]) => {
        setEntry(e);
        setEvents(ev as DeploymentEventsResponse);
      })
      .catch((err: unknown) =>
        setError(
          err instanceof Error
            ? err.message
            : "Failed to load deployment details",
        ),
      )
      .finally(() => setLoading(false));
  }, [deploymentId]);

  useEffect(() => {
    load();
    // Live-poll while the deployment is running.
    const timer = window.setInterval(() => {
      if (!entry || entry.status === "running") load();
    }, 15_000);
    return () => window.clearInterval(timer);
  }, [load, entry]);

  if (loading && !entry) {
    return (
      <div className="p-6 text-[var(--color-text-muted)] font-mono">
        Loading deployment {deploymentId}…
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-6 space-y-2">
        <Link
          to="/vm-deployments"
          className="text-xs text-[var(--color-accent-blue)]"
        >
          ← Back to VM Deployments
        </Link>
        <div className="text-[var(--color-error)] text-sm">Error: {error}</div>
      </div>
    );
  }

  if (!entry) return <div className="p-6">Not found.</div>;

  const fields: Array<[string, string | number | null]> = [
    ["Deployment ID", entry.deployment_id],
    ["VM name", entry.vm_name],
    ["Category", entry.category],
    ["Task", entry.task],
    ["Mode", entry.mode],
    ["Date range", `${entry.start_date} → ${entry.end_date}`],
    ["Started", entry.started_at],
    ["Last heartbeat", entry.last_heartbeat_at],
    ["Completed", entry.completed_at],
    ["Exit code", entry.exit_code],
    ["Rows in", entry.rows_in],
    ["Rows out", entry.rows_out],
    ["Rows error", entry.rows_error],
    ["Events emitted", entry.events_emitted],
    ["Log URI", entry.log_uri],
  ];

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <Link
            to="/vm-deployments"
            className="text-xs text-[var(--color-accent-blue)]"
          >
            ← Back to VM Deployments
          </Link>
          <h1 className="text-base font-semibold text-[var(--color-text-primary)] mt-1">
            {entry.vm_name}
          </h1>
          <p className="text-xs text-[var(--color-text-tertiary)] font-mono">
            {entry.deployment_id}
          </p>
        </div>
        <div className="flex items-center gap-3">
          <Badge variant={STATUS_VARIANT[entry.status] ?? "default"}>
            {entry.status}
          </Badge>
          <Button variant="outline" size="sm" onClick={load}>
            Refresh
          </Button>
        </div>
      </div>

      <Card className="rounded-lg">
        <CardHeader>
          <CardTitle>Summary</CardTitle>
        </CardHeader>
        <CardContent>
          <dl className="grid grid-cols-1 md:grid-cols-2 gap-x-6 gap-y-2 text-sm">
            {fields.map(([k, v]) => (
              <div key={k} className="flex justify-between gap-4">
                <dt className="text-[var(--color-text-muted)]">{k}</dt>
                <dd
                  className="font-mono text-xs truncate max-w-[60%]"
                  title={String(v ?? "—")}
                >
                  {v == null || v === "" ? "—" : String(v)}
                </dd>
              </div>
            ))}
          </dl>
        </CardContent>
      </Card>

      <Card className="rounded-lg">
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle>Event stream</CardTitle>
            <Badge variant="info">{events?.count ?? 0}</Badge>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr>
                  <th className="table-header-cell">Timestamp</th>
                  <th className="table-header-cell">Event</th>
                  <th className="table-header-cell">Detail</th>
                </tr>
              </thead>
              <tbody>
                {!events || events.events.length === 0 ? (
                  <tr>
                    <td
                      colSpan={3}
                      className="table-cell text-center text-[var(--color-text-muted)] py-6"
                    >
                      No events yet.
                    </td>
                  </tr>
                ) : (
                  events.events.map((e, i) => (
                    <tr key={i} className="table-row">
                      <td className="table-cell font-mono text-xs text-[var(--color-text-muted)]">
                        {e.timestamp}
                      </td>
                      <td className="table-cell text-xs font-semibold">
                        {e.event_type}
                      </td>
                      <td className="table-cell font-mono text-xs truncate max-w-[60ch]">
                        {formatValue(e.message ?? e)}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
