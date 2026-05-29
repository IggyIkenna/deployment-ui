import { useCallback, useEffect, useState } from "react";
import { fetchVenueCredentials, type VenueCredentialStatus } from "../api/deploymentApi";
import { Badge } from "./ui/badge";
import { Button } from "./ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "./ui/card";

function statusVariant(status: string): "success" | "warning" | "error" | "default" {
  switch (status) {
    case "active":
      return "success";
    case "expired":
      return "error";
    case "missing":
      return "default";
    case "mock":
      return "warning";
    default:
      return "warning";
  }
}

function formatCheckedAt(iso: string): string {
  try {
    return new Date(iso).toLocaleString([], {
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    });
  } catch {
    return iso;
  }
}

export function VenueCredentialsPanel() {
  const [credentials, setCredentials] = useState<VenueCredentialStatus[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(() => {
    setLoading(true);
    setError(null);
    fetchVenueCredentials()
      .then(setCredentials)
      .catch((err: unknown) => setError(err instanceof Error ? err.message : "Failed to load venue credentials"))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  return (
    <Card className="rounded-lg" data-testid="venue-credentials-panel">
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle>Venue API Credentials</CardTitle>
            <p className="text-xs text-[var(--color-text-tertiary)] mt-0.5">
              Status of venue API keys — name and status only, key values are never shown.
            </p>
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={load}
            disabled={loading}
            data-testid="venue-credentials-refresh-btn"
          >
            {loading ? "Checking…" : "Refresh"}
          </Button>
        </div>
      </CardHeader>
      <CardContent className="p-0">
        {error && (
          <div className="text-[var(--color-error)] text-xs px-4 py-2" data-testid="venue-credentials-error">
            Error: {error}
          </div>
        )}
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr>
                <th className="table-header-cell">Secret Name</th>
                <th className="table-header-cell">Venue</th>
                <th className="table-header-cell">Status</th>
                <th className="table-header-cell">Detail</th>
                <th className="table-header-cell">Checked</th>
              </tr>
            </thead>
            <tbody>
              {credentials.length === 0 && !loading ? (
                <tr>
                  <td colSpan={5} className="table-cell text-center text-[var(--color-text-muted)] py-6">
                    No credentials configured
                  </td>
                </tr>
              ) : (
                credentials.map((c) => (
                  <tr key={c.name} className="table-row" data-testid={`credential-row-${c.name}`}>
                    <td className="table-cell font-mono text-xs font-semibold">{c.name}</td>
                    <td className="table-cell text-xs">{c.venue}</td>
                    <td className="table-cell">
                      <Badge variant={statusVariant(c.status)} data-testid={`credential-status-${c.name}`}>
                        {c.status.toUpperCase()}
                      </Badge>
                    </td>
                    <td className="table-cell text-xs text-[var(--color-text-muted)]">{c.probe_detail ?? "—"}</td>
                    <td
                      className="table-cell text-xs text-[var(--color-text-muted)]"
                      style={{ fontVariantNumeric: "tabular-nums" }}
                    >
                      {formatCheckedAt(c.checked_at)}
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
}
