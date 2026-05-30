import { useCallback, useEffect, useState } from "react";
import { fetchVenueDateRanges, type VenueDateRangeInfo } from "../api/deploymentApi";
import { Badge } from "./ui/badge";
import { Button } from "./ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "./ui/card";

function keyStatusVariant(status: string): "success" | "warning" | "error" | "default" {
  switch (status) {
    case "active":
      return "success";
    case "expired":
      return "error";
    case "missing":
      return "default";
    default:
      return "warning";
  }
}

export function VenueDateRangePanel() {
  const [rows, setRows] = useState<VenueDateRangeInfo[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(() => {
    setLoading(true);
    setError(null);
    fetchVenueDateRanges()
      .then(setRows)
      .catch((err: unknown) => setError(err instanceof Error ? err.message : "Failed to load venue date ranges"))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  return (
    <Card className="rounded-lg" data-testid="venue-date-range-panel">
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle>Venue Date Range Availability</CardTitle>
            <p className="text-xs text-[var(--color-text-tertiary)] mt-0.5">
              Dates fetchable on current key (free tier: 1st-of-month + last 30 days) vs dates requiring a renewed paid
              key.
            </p>
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={load}
            disabled={loading}
            data-testid="venue-date-range-refresh-btn"
          >
            {loading ? "Loading…" : "Refresh"}
          </Button>
        </div>
      </CardHeader>
      <CardContent className="p-0">
        {error && (
          <div className="text-[var(--color-error)] text-xs px-4 py-2" data-testid="venue-date-range-error">
            Error: {error}
          </div>
        )}
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr>
                <th className="table-header-cell">Venue</th>
                <th className="table-header-cell">Key</th>
                <th className="table-header-cell">Key Status</th>
                <th className="table-header-cell">Free-Tier Dates</th>
                <th className="table-header-cell">Requires Paid Key</th>
                <th className="table-header-cell">Sample Free Dates</th>
              </tr>
            </thead>
            <tbody>
              {rows.length === 0 && !loading ? (
                <tr>
                  <td colSpan={6} className="table-cell text-center text-[var(--color-text-muted)] py-6">
                    No venues configured
                  </td>
                </tr>
              ) : (
                rows.map((r) => (
                  <tr key={r.venue} className="table-row" data-testid={`venue-date-range-row-${r.venue}`}>
                    <td className="table-cell font-semibold text-xs">{r.venue}</td>
                    <td className="table-cell font-mono text-xs">{r.key_name}</td>
                    <td className="table-cell">
                      <Badge
                        variant={keyStatusVariant(r.key_status)}
                        data-testid={`venue-date-range-key-status-${r.venue}`}
                      >
                        {r.key_status.toUpperCase()}
                      </Badge>
                    </td>
                    <td
                      className="table-cell text-xs"
                      title={r.free_description}
                      data-testid={`venue-date-range-free-count-${r.venue}`}
                    >
                      <span className="text-[var(--color-success)] font-semibold">
                        {r.free_date_count.toLocaleString()}
                      </span>
                      <span className="text-[var(--color-text-muted)] ml-1">dates</span>
                    </td>
                    <td
                      className="table-cell text-xs"
                      title={r.paid_description}
                      data-testid={`venue-date-range-paid-count-${r.venue}`}
                    >
                      <span className="text-[var(--color-warning)] font-semibold">
                        {r.paid_date_count.toLocaleString()}
                      </span>
                      <span className="text-[var(--color-text-muted)] ml-1">dates</span>
                    </td>
                    <td className="table-cell text-xs text-[var(--color-text-muted)] font-mono">
                      {r.free_sample_dates.slice(-3).join(", ")}
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
