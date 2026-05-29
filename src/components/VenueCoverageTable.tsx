import { AlertCircle, RefreshCw } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { getVenueYearCoverage, type VenueYearCoverageResponse, type VenueYearRow } from "../api/client";
import { Badge } from "./ui/badge";
import { Button } from "./ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "./ui/card";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const ALL_ASSET_GROUPS = ["cefi", "tradfi", "defi", "sports", "prediction"];
const DEFAULT_ASSET_GROUPS = ["cefi", "tradfi", "defi"];

// ---------------------------------------------------------------------------
// Status cell rendering
// ---------------------------------------------------------------------------

interface StatusCellProps {
  count: number;
  kind: "captured" | "empty_confirmed" | "expected_unattempted" | "pending_paid_key" | "attempted_failed";
}

function StatusCell({ count, kind }: StatusCellProps): React.ReactElement {
  if (count === 0) {
    return <span className="text-[var(--color-text-muted)]">—</span>;
  }

  const styles: Record<StatusCellProps["kind"], string> = {
    captured: "text-[var(--color-accent-green)] font-medium",
    empty_confirmed: "text-[var(--color-text-secondary)]",
    expected_unattempted: "text-[var(--color-accent-blue)]",
    pending_paid_key: "text-[var(--color-accent-yellow,#d97706)] font-medium",
    attempted_failed: "text-[var(--color-accent-red)] font-medium",
  };

  return <span className={styles[kind]}>{count}</span>;
}

// ---------------------------------------------------------------------------
// Pending-paid-key tooltip note
// ---------------------------------------------------------------------------

function PendingPaidKeyNote({ row }: { row: VenueYearRow }): React.ReactElement | null {
  if (row.pending_paid_key === 0) return null;
  return (
    <span
      className="ml-1 text-[10px] text-[var(--color-accent-yellow,#d97706)] font-medium"
      title={`${row.pending_paid_key} day(s) blocked by credentials — downloadable once key active`}
    >
      ★key
    </span>
  );
}

// ---------------------------------------------------------------------------
// Asset group toggle pills
// ---------------------------------------------------------------------------

interface AssetGroupToggleProps {
  selected: string[];
  onChange: (next: string[]) => void;
}

function AssetGroupToggle({ selected, onChange }: AssetGroupToggleProps): React.ReactElement {
  function toggle(ag: string) {
    if (selected.includes(ag)) {
      onChange(selected.filter((x) => x !== ag));
    } else {
      onChange([...selected, ag]);
    }
  }

  return (
    <div className="flex flex-wrap gap-1.5">
      {ALL_ASSET_GROUPS.map((ag) => {
        const active = selected.includes(ag);
        return (
          <button
            key={ag}
            onClick={() => toggle(ag)}
            className={[
              "rounded-full px-2.5 py-0.5 text-xs font-medium transition-colors",
              active
                ? "bg-[var(--color-accent-blue)] text-white"
                : "bg-[var(--color-bg-tertiary)] text-[var(--color-text-secondary)] hover:bg-[var(--color-bg-secondary)]",
            ].join(" ")}
            data-testid={`ag-toggle-${ag}`}
          >
            {ag.toUpperCase()}
          </button>
        );
      })}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

export function VenueCoverageTable(): React.ReactElement {
  const [selectedAgs, setSelectedAgs] = useState<string[]>(DEFAULT_ASSET_GROUPS);
  const [data, setData] = useState<VenueYearCoverageResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(() => {
    if (selectedAgs.length === 0) {
      setData({ rows: [], asset_groups_loaded: [], asset_groups_failed: [] });
      return;
    }
    setLoading(true);
    setError(null);
    getVenueYearCoverage(selectedAgs)
      .then(setData)
      .catch((err: unknown) => {
        setError(err instanceof Error ? err.message : "Failed to load coverage");
      })
      .finally(() => setLoading(false));
  }, [selectedAgs]);

  useEffect(() => {
    load();
  }, [load]);

  const rows = data?.rows ?? [];

  // Group rows by venue for rendering
  const venues = [...new Set(rows.map((r) => r.venue))].sort();

  const years = [...new Set(rows.map((r) => r.year))].sort((a, b) => a - b);

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between gap-4">
          <div>
            <CardTitle className="text-base">Venue × Year Coverage</CardTitle>
            <CardDescription className="text-xs mt-0.5">
              Per-venue daily-capture status rolled up by year. Cells marked{" "}
              <span className="font-medium text-[var(--color-accent-yellow,#d97706)]">★key</span> are blocked by
              credentials — downloadable once key active.
            </CardDescription>
          </div>
          <Button
            variant="ghost"
            size="sm"
            onClick={load}
            disabled={loading}
            className="shrink-0"
            data-testid="venue-coverage-refresh"
          >
            <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
          </Button>
        </div>
        <div className="mt-3">
          <AssetGroupToggle selected={selectedAgs} onChange={setSelectedAgs} />
        </div>
        {data && data.asset_groups_failed.length > 0 && (
          <div className="mt-2 flex items-center gap-2 text-xs text-[var(--color-accent-red)]">
            <AlertCircle className="h-3.5 w-3.5 shrink-0" />
            <span>Failed to load: {data.asset_groups_failed.map((ag) => ag.toUpperCase()).join(", ")}</span>
          </div>
        )}
      </CardHeader>
      <CardContent>
        {error && (
          <div
            role="alert"
            className="flex items-center gap-2 rounded-md border border-[var(--color-accent-red)]/30 bg-[var(--color-accent-red)]/10 px-3 py-2 text-sm text-[var(--color-accent-red)]"
            data-testid="venue-coverage-error"
          >
            <AlertCircle className="h-4 w-4 shrink-0" />
            {error}
          </div>
        )}

        {!error && rows.length === 0 && !loading && (
          <p className="text-sm text-[var(--color-text-secondary)]">
            {selectedAgs.length === 0
              ? "Select at least one asset group."
              : "No coverage data found for the selected asset groups."}
          </p>
        )}

        {rows.length > 0 && (
          <div className="overflow-x-auto" data-testid="venue-coverage-table">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-[var(--color-border)]">
                  <th className="py-2 pr-3 text-left font-medium text-[var(--color-text-secondary)]">Venue</th>
                  <th className="py-2 pr-3 text-left font-medium text-[var(--color-text-secondary)]">Group</th>
                  <th className="py-2 pr-3 text-left font-medium text-[var(--color-text-secondary)]">Year</th>
                  <th className="py-2 pr-3 text-right font-medium text-[var(--color-text-secondary)]">Captured</th>
                  <th className="py-2 pr-3 text-right font-medium text-[var(--color-text-secondary)]">Empty</th>
                  <th className="py-2 pr-3 text-right font-medium text-[var(--color-text-secondary)]">Unattempted</th>
                  <th className="py-2 pr-3 text-right font-medium text-[var(--color-accent-yellow,#d97706)]">
                    Pending Key
                  </th>
                  <th className="py-2 pr-3 text-right font-medium text-[var(--color-text-secondary)]">Failed</th>
                  <th className="py-2 text-right font-medium text-[var(--color-text-secondary)]">Total</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <tr
                    key={`${row.venue}-${row.asset_group}-${row.year}`}
                    className="border-b border-[var(--color-border)]/50 hover:bg-[var(--color-bg-secondary)]/50 transition-colors"
                    data-testid="venue-coverage-row"
                  >
                    <td className="py-1.5 pr-3 font-mono font-medium text-[var(--color-text-primary)]">{row.venue}</td>
                    <td className="py-1.5 pr-3">
                      <Badge variant="default" className="text-[10px] py-0">
                        {row.asset_group}
                      </Badge>
                    </td>
                    <td className="py-1.5 pr-3 text-[var(--color-text-secondary)]">{row.year}</td>
                    <td className="py-1.5 pr-3 text-right">
                      <StatusCell count={row.captured} kind="captured" />
                    </td>
                    <td className="py-1.5 pr-3 text-right">
                      <StatusCell count={row.empty_confirmed} kind="empty_confirmed" />
                    </td>
                    <td className="py-1.5 pr-3 text-right">
                      <StatusCell count={row.expected_unattempted} kind="expected_unattempted" />
                    </td>
                    <td className="py-1.5 pr-3 text-right">
                      <span>
                        <StatusCell count={row.pending_paid_key} kind="pending_paid_key" />
                        <PendingPaidKeyNote row={row} />
                      </span>
                    </td>
                    <td className="py-1.5 pr-3 text-right">
                      <StatusCell count={row.attempted_failed} kind="attempted_failed" />
                    </td>
                    <td className="py-1.5 text-right text-[var(--color-text-secondary)]">{row.total}</td>
                  </tr>
                ))}
              </tbody>
            </table>

            {/* Summary badges */}
            <div className="mt-3 flex flex-wrap gap-2 text-xs text-[var(--color-text-secondary)]">
              {data?.asset_groups_loaded.map((ag) => (
                <span key={ag} className="rounded bg-[var(--color-bg-tertiary)] px-1.5 py-0.5">
                  {ag.toUpperCase()} loaded
                </span>
              ))}
              <span className="ml-auto">
                {venues.length} venue{venues.length !== 1 ? "s" : ""} · {years.length} year
                {years.length !== 1 ? "s" : ""} · {rows.length} row{rows.length !== 1 ? "s" : ""}
              </span>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
