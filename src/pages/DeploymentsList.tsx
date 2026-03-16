import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { fetchServices } from "../api/deploymentApi";
import type { ServiceStatus, ServiceHealth } from "../types/deploymentTypes";
import { Button } from "@unified-trading/ui-kit";

const HEALTH_COLORS: Record<ServiceHealth, string> = {
  HEALTHY: "var(--color-accent-green)",
  DEGRADED: "var(--color-accent-amber)",
  UNHEALTHY: "var(--color-accent-red)",
  UNKNOWN: "var(--color-text-muted)",
};

const HEALTH_ICONS: Record<ServiceHealth, string> = {
  HEALTHY: "●",
  DEGRADED: "◐",
  UNHEALTHY: "○",
  UNKNOWN: "?",
};

export function DeploymentsList() {
  const [services, setServices] = useState<ServiceStatus[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = () => {
    setLoading(true);
    fetchServices()
      .then(setServices)
      .catch((err: unknown) =>
        setError(
          err instanceof Error ? err.message : "Failed to load services",
        ),
      )
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    load();
  }, []);

  const healthy = services.filter((s) => s.health === "HEALTHY").length;
  const total = services.length;

  if (loading)
    return (
      <div
        style={{
          padding: "24px",
          color: "var(--color-text-muted)",
          fontFamily: "monospace",
        }}
      >
        Loading services...
      </div>
    );

  return (
    <div style={{ padding: "16px", fontFamily: "monospace" }}>
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          marginBottom: "16px",
        }}
      >
        <h2 style={{ margin: 0 }}>Services</h2>
        <div style={{ display: "flex", gap: "16px", alignItems: "center" }}>
          <span
            style={{
              color:
                healthy === total
                  ? "var(--color-accent-green)"
                  : "var(--color-accent-amber)",
              fontSize: "14px",
            }}
          >
            {healthy}/{total} healthy
          </span>
          <Button variant="outline" onClick={load}>
            Refresh
          </Button>
          <Link
            to="/deploy"
            style={{
              padding: "6px 12px",
              background: "var(--color-accent-blue)",
              color: "white",
              borderRadius: "4px",
              textDecoration: "none",
              fontSize: "13px",
            }}
          >
            + Deploy
          </Link>
        </div>
      </div>

      {error && (
        <div
          style={{
            color: "var(--color-accent-red)",
            marginBottom: "12px",
          }}
        >
          Error: {error}
        </div>
      )}

      {services.length === 0 ? (
        <p style={{ color: "var(--color-text-muted)" }}>No services found.</p>
      ) : (
        <table className="w-full">
          <thead>
            <tr>
              <th className="table-header-cell">Service</th>
              <th className="table-header-cell">Health</th>
              <th className="table-header-cell">Version</th>
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
                  <span style={{ color: HEALTH_COLORS[svc.health] }}>
                    {HEALTH_ICONS[svc.health]} {svc.health}
                  </span>
                </td>
                <td
                  className="table-cell"
                  style={{ color: "var(--color-text-muted)" }}
                >
                  {svc.current_version}
                </td>
                <td
                  className="table-cell"
                  style={{ color: "var(--color-text-muted)" }}
                >
                  {svc.environment}
                </td>
                <td className="table-cell text-right">
                  <span
                    style={{
                      color:
                        svc.replicas_ready < svc.replicas_total
                          ? "var(--color-accent-amber)"
                          : "var(--color-accent-green)",
                    }}
                  >
                    {svc.replicas_ready}/{svc.replicas_total}
                  </span>
                </td>
                <td
                  className="table-cell text-xs"
                  style={{ color: "var(--color-text-muted)" }}
                >
                  {new Date(svc.last_deployed_at).toLocaleString()}
                </td>
                <td className="table-cell">
                  <Link
                    to={`/history?service=${svc.service_id}`}
                    style={{
                      color: "var(--color-accent-blue)",
                      textDecoration: "none",
                      fontSize: "12px",
                    }}
                  >
                    History
                  </Link>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
