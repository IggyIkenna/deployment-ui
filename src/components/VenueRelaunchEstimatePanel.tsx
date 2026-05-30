import { useCallback, useEffect, useState } from "react";
import {
  fetchVenueRelaunchEstimate,
  type RelaunchEstimateRow,
  type VenueRelaunchEstimateResponse,
} from "../api/deploymentApi";
import { Badge } from "./ui/badge";
import { Button } from "./ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "./ui/card";

function keyStatusVariant(status: string): "success" | "warning" | "error" | "default" {
  if (status === "active") return "success";
  if (status === "expired") return "error";
  if (status === "missing") return "default";
  return "warning";
}

function freePctColor(pct: number): string {
  if (pct >= 50) return "text-[var(--color-success)]";
  if (pct >= 15) return "text-[var(--color-warning)]";
  return "text-[var(--color-text-secondary)]";
}

function SummaryBar({ summary }: { summary: VenueRelaunchEstimateResponse["summary"] }) {
  const nowPct =
    summary.total_pending > 0 ? Math.round((100 * summary.total_now_unlockable) / summary.total_pending) : 0;

  return (
    <div
      className="flex flex-wrap gap-4 px-4 py-3 border-b border-[var(--color-border)]"
      data-testid="relaunch-estimate-summary"
    >
      <div className="text-xs">
        <span className="text-[var(--color-text-muted)]">Pending (key blocked): </span>
        <span className="font-semibold">{summary.total_pending.toLocaleString()}</span>
        <span className="text-[var(--color-text-muted)] ml-1">dates</span>
      </div>
      <div className="text-xs">
        <span className="text-[var(--color-text-muted)]">Unlockable now (free tier): </span>
        <span className="font-semibold text-[var(--color-success)]">
          ~{summary.total_now_unlockable.toLocaleString()}
        </span>
        <span className="text-[var(--color-text-muted)] ml-1">({nowPct}%)</span>
      </div>
      <div className="text-xs">
        <span className="text-[var(--color-text-muted)]">After key renewal: </span>
        <span className="font-semibold text-[var(--color-accent-blue)]">
          {summary.total_after_renewal.toLocaleString()}
        </span>
        <span className="text-[var(--color-text-muted)] ml-1">(100%)</span>
      </div>
      <div className="text-xs">
        <span className="text-[var(--color-text-muted)]">Key: </span>
        <Badge variant={keyStatusVariant(summary.key_status)} className="text-[10px] py-0">
          {summary.key_status.toUpperCase()}
        </Badge>
      </div>
    </div>
  );
}

function EstimateRow({ row }: { row: RelaunchEstimateRow }) {
  const nowPct = row.pending_total > 0 ? Math.round((100 * row.est_now_unlockable) / row.pending_total) : 0;

  return (
    <tr className="table-row" data-testid={`relaunch-row-${row.venue}-${row.year}`}>
      <td className="table-cell font-semibold text-xs">{row.venue}</td>
      <td className="table-cell text-xs">{row.asset_group}</td>
      <td className="table-cell text-xs" style={{ fontVariantNumeric: "tabular-nums" }}>
        {row.year}
      </td>
      <td className="table-cell text-xs" style={{ fontVariantNumeric: "tabular-nums" }}>
        <span className="text-[var(--color-warning)] font-semibold">{row.pending_total.toLocaleString()}</span>
      </td>
      <td className="table-cell text-xs" title={`${row.free_pct}% of ${row.year} dates are free-tier`}>
        <span className={`font-semibold ${freePctColor(row.free_pct)}`}>~{row.est_now_unlockable}</span>
        <span className="text-[var(--color-text-muted)] ml-1">({nowPct}%)</span>
      </td>
      <td className="table-cell text-xs" style={{ fontVariantNumeric: "tabular-nums" }}>
        <span className="text-[var(--color-accent-blue)] font-semibold">{row.est_after_renewal.toLocaleString()}</span>
        <span className="text-[var(--color-text-muted)] ml-1">(100%)</span>
      </td>
      <td className="table-cell text-xs text-[var(--color-text-muted)]" style={{ fontVariantNumeric: "tabular-nums" }}>
        {row.free_pct}%
      </td>
    </tr>
  );
}

export function VenueRelaunchEstimatePanel() {
  const [data, setData] = useState<VenueRelaunchEstimateResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(() => {
    setLoading(true);
    setError(null);
    fetchVenueRelaunchEstimate()
      .then(setData)
      .catch((err: unknown) => setError(err instanceof Error ? err.message : "Failed to load relaunch estimate"))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  return (
    <Card className="rounded-lg" data-testid="venue-relaunch-estimate-panel">
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle>Relaunch Coverage Estimate</CardTitle>
            <p className="text-xs text-[var(--color-text-tertiary)] mt-0.5">
              Pending credential-blocked dates: how many unlock with the current free-tier key vs after key renewal.
              Helps decide whether to relaunch now or wait.
            </p>
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={load}
            disabled={loading}
            data-testid="relaunch-estimate-refresh-btn"
          >
            {loading ? "Loading…" : "Refresh"}
          </Button>
        </div>
      </CardHeader>
      <CardContent className="p-0">
        {error && (
          <div className="text-[var(--color-error)] text-xs px-4 py-2" data-testid="relaunch-estimate-error">
            Error: {error}
          </div>
        )}
        {data && <SummaryBar summary={data.summary} />}
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr>
                <th className="table-header-cell">Venue</th>
                <th className="table-header-cell">Asset Group</th>
                <th className="table-header-cell">Year</th>
                <th className="table-header-cell">Pending Dates</th>
                <th className="table-header-cell">Unlockable Now</th>
                <th className="table-header-cell">After Renewal</th>
                <th className="table-header-cell">Free-Tier %</th>
              </tr>
            </thead>
            <tbody>
              {!data || data.rows.length === 0 ? (
                <tr>
                  <td colSpan={7} className="table-cell text-center text-[var(--color-text-muted)] py-6">
                    {loading ? "Loading…" : "No pending credential-blocked dates"}
                  </td>
                </tr>
              ) : (
                data.rows.map((r) => <EstimateRow key={`${r.venue}-${r.asset_group}-${r.year}`} row={r} />)
              )}
            </tbody>
          </table>
        </div>
      </CardContent>
    </Card>
  );
}
