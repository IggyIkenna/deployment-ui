import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { fetchServices } from "../api/deploymentApi";
import type { ServiceStatus, ServiceHealth } from "../types/deploymentTypes";
import { Button } from "@unified-trading/ui-kit";

const HEALTH_COLORS: Record<ServiceHealth, string> = {
  HEALTHY: "#16A34A",
  DEGRADED: "#D97706",
  UNHEALTHY: "#DC2626",
  UNKNOWN: "#6B7280",
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
        style={{ padding: "24px", color: "#6B7280", fontFamily: "monospace" }}
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
              color: healthy === total ? "#16A34A" : "#D97706",
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
              background: "#2563EB",
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
        <div style={{ color: "#DC2626", marginBottom: "12px" }}>
          Error: {error}
        </div>
      )}

      {services.length === 0 ? (
        <p style={{ color: "#6B7280" }}>No services found.</p>
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
                <td className="table-cell" style={{ color: "#9CA3AF" }}>
                  {svc.current_version}
                </td>
                <td className="table-cell" style={{ color: "#9CA3AF" }}>
                  {svc.environment}
                </td>
                <td className="table-cell text-right">
                  <span
                    style={{
                      color:
                        svc.replicas_ready < svc.replicas_total
                          ? "#D97706"
                          : "#16A34A",
                    }}
                  >
                    {svc.replicas_ready}/{svc.replicas_total}
                  </span>
                </td>
                <td className="table-cell text-xs" style={{ color: "#9CA3AF" }}>
                  {new Date(svc.last_deployed_at).toLocaleString()}
                </td>
                <td className="table-cell">
                  <Link
                    to={`/history?service=${svc.service_id}`}
                    style={{
                      color: "#2563EB",
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
