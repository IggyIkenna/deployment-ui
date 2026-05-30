import { useCallback, useEffect, useState } from "react";
import { fetchVenueTardisWindows, type VenueTardisWindowsResponse } from "../api/deploymentApi";
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
    case "mock":
      return "warning";
    default:
      return "warning";
  }
}

export function VenueTardisWindowsPanel() {
  const [data, setData] = useState<VenueTardisWindowsResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(() => {
    setLoading(true);
    setError(null);
    fetchVenueTardisWindows()
      .then(setData)
      .catch((err: unknown) => setError(err instanceof Error ? err.message : "Failed to load Tardis windows"))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const keyBlocked = data !== null && (data.key_status === "expired" || data.key_status === "missing");

  return (
    <Card className="rounded-lg" data-testid="venue-tardis-windows-panel">
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle>Tardis Free vs Paid Date Ranges</CardTitle>
            <p className="text-xs text-[var(--color-text-tertiary)] mt-0.5">
              Which dates are fetchable on the current key vs which need a paid/active key.
            </p>
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={load}
            disabled={loading}
            data-testid="venue-tardis-windows-refresh-btn"
          >
            {loading ? "Loading…" : "Refresh"}
          </Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {error && (
          <div className="text-[var(--color-error)] text-xs" data-testid="venue-tardis-windows-error" role="alert">
            Error: {error}
          </div>
        )}

        {data && (
          <>
            {/* Key status row */}
            <div className="flex items-center gap-2 text-sm" data-testid="tardis-key-status-row">
              <span className="text-[var(--color-text-secondary)]">Key ({data.key_name}):</span>
              <Badge variant={keyStatusVariant(data.key_status)} data-testid="tardis-key-status-badge">
                {data.key_status.toUpperCase()}
              </Badge>
              <span className="text-xs text-[var(--color-text-muted)]">as of {data.as_of}</span>
            </div>

            {/* Free tier box */}
            <div
              className="rounded border border-[var(--color-accent-green)] bg-[var(--color-surface-secondary)] px-4 py-3 text-sm space-y-1"
              data-testid="tardis-free-tier-box"
            >
              <div className="font-medium text-[var(--color-accent-green)]">Free tier — always fetchable</div>
              <ul className="list-disc list-inside text-xs text-[var(--color-text-secondary)] space-y-0.5">
                <li>1st of every calendar month (all years)</li>
                <li>
                  Rolling window: last {data.free_tier.rolling_window_days} days (since{" "}
                  {data.free_tier.rolling_window_cutoff})
                </li>
              </ul>
            </div>

            {/* Paid tier box */}
            <div
              className={`rounded border px-4 py-3 text-sm space-y-1 ${
                keyBlocked
                  ? "border-[var(--color-accent-yellow)] bg-[var(--color-surface-secondary)]"
                  : "border-[var(--color-border)] bg-[var(--color-surface-secondary)]"
              }`}
              data-testid="tardis-paid-tier-box"
            >
              <div
                className={`font-medium ${
                  keyBlocked ? "text-[var(--color-accent-yellow)]" : "text-[var(--color-text-primary)]"
                }`}
              >
                Paid tier — all other historical dates
              </div>
              {keyBlocked ? (
                <p className="text-xs text-[var(--color-text-secondary)]" data-testid="tardis-paid-tier-blocked-msg">
                  ⚠ Key is <span className="font-medium">{data.key_status.toLowerCase()}</span> — non-first, non-recent
                  dates are blocked. Cells marked ★key in the Coverage table above will become fetchable once the key is
                  renewed.
                </p>
              ) : (
                <p className="text-xs text-[var(--color-text-secondary)]" data-testid="tardis-paid-tier-active-msg">
                  ✓ Key is active — all historical dates are fetchable.
                </p>
              )}
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}
