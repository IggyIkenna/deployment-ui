import { Loader2 } from "lucide-react";
import { useEffect, useState } from "react";
import {
  getPoolBreakdown,
  type PoolBreakdownResponse,
  type PoolCoverageState,
} from "../api/client";
import { ModalShell } from "./DataStatusDrilldown";

/**
 * Per-pool DeFi drill-down modal.
 *
 * Backed by ``/api/data-status/pools/breakdown`` (deployment-api ``c83821d``).
 * Renders one row per pool surfaced under (day, venue, chain) with a
 * coverage map (data_type → state) and a coverage_summary count tally.
 *
 * Wired into ``DataStatusTab.tsx`` from any DEFI venue row in the data-status
 * tree as a sibling to the existing schema affordance.
 */

const MAX_VISIBLE_POOLS = 100;
const POOL_ID_TRUNCATE = 40;

function coverageStateColor(state: PoolCoverageState): string {
  switch (state) {
    case "captured":
      return "var(--color-accent-green)";
    case "empty_confirmed":
      return "var(--color-accent-yellow)";
    case "missing":
      return "var(--color-accent-red)";
    case "failed":
      return "var(--color-text-muted)";
  }
}

function coverageStateLabel(state: PoolCoverageState): string {
  switch (state) {
    case "captured":
      return "captured";
    case "empty_confirmed":
      return "empty";
    case "missing":
      return "missing";
    case "failed":
      return "failed";
  }
}

function truncatePoolId(poolId: string): string {
  if (poolId.length <= POOL_ID_TRUNCATE) return poolId;
  return `${poolId.slice(0, POOL_ID_TRUNCATE - 1)}…`;
}

function CoverageBadge({
  dataType,
  state,
}: {
  dataType: string;
  state: PoolCoverageState;
}) {
  return (
    <span
      className="text-[9px] font-mono px-1.5 py-0.5 rounded border"
      style={{
        borderColor: coverageStateColor(state),
        color: coverageStateColor(state),
      }}
      title={`${dataType}: ${state}`}
      data-testid={`defi-pool-coverage-${dataType}`}
      data-coverage-state={state}
    >
      {dataType}: {coverageStateLabel(state)}
    </span>
  );
}

export function PoolBreakdownModal({
  venue,
  chain,
  day,
  onClose,
}: {
  venue: string;
  chain: string;
  day: string;
  onClose: () => void;
}) {
  const [response, setResponse] = useState<PoolBreakdownResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    setResponse(null);
    getPoolBreakdown({ day, venue, chain })
      .then((r) => {
        if (!cancelled) {
          setResponse(r);
          setLoading(false);
        }
      })
      .catch((e: Error) => {
        if (!cancelled) {
          setError(e.message);
          setLoading(false);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [day, venue, chain]);

  const resolvedDay = response?.day ?? day;
  const title = `Pool breakdown · ${venue}-${chain} · ${resolvedDay}`;

  return (
    <ModalShell title={title} onClose={onClose}>
      <div data-testid="defi-pools-modal" className="space-y-2">
        {loading && (
          <div
            className="flex items-center gap-2 text-xs text-[var(--color-text-muted)] py-4 justify-center"
            data-testid="defi-pools-loading"
          >
            <Loader2 className="h-4 w-4 animate-spin" />
            <span>Fetching pool breakdown… (cold call may take 5-15s)</span>
          </div>
        )}
        {error && (
          <div
            className="text-xs text-[var(--color-accent-red)]"
            data-testid="defi-pools-error"
          >
            Error: {error}
          </div>
        )}
        {!loading && !error && response && response.status === "no_data" && (
          <div
            className="text-xs italic text-[var(--color-text-muted)] py-4 text-center"
            data-testid="defi-pools-empty"
          >
            No pool data for {venue}-{chain} on {resolvedDay}.
          </div>
        )}
        {!loading && !error && response && response.status === "resolved" && (
          <>
            <div className="text-[11px] text-[var(--color-text-muted)] flex flex-wrap gap-3">
              <span>
                <span className="text-[var(--color-text-muted)]">pools:</span>{" "}
                <span className="font-mono">{response.pools.length}</span>
                {response.pools_expected > 0 && (
                  <>
                    {" / "}
                    <span className="font-mono">{response.pools_expected}</span>
                    <span className="text-[var(--color-text-muted)]">
                      {" "}
                      expected
                    </span>
                  </>
                )}
              </span>
              {response.data_types_expected.length > 0 && (
                <span>
                  <span className="text-[var(--color-text-muted)]">
                    data_types:
                  </span>{" "}
                  <span className="font-mono">
                    {response.data_types_expected.join(", ")}
                  </span>
                </span>
              )}
            </div>
            <div className="max-h-96 overflow-y-auto border border-[var(--color-border-subtle)] rounded">
              {response.pools.slice(0, MAX_VISIBLE_POOLS).map((row) => (
                <div
                  key={row.pool_id}
                  className="flex flex-col gap-1 py-1.5 px-2 border-b border-[var(--color-border-subtle)] last:border-b-0 hover:bg-[var(--color-bg-hover)]"
                  data-testid={`defi-pool-row-${row.pool_id}`}
                >
                  <div className="flex items-center gap-2 text-[11px]">
                    <span
                      className="font-mono truncate flex-1 min-w-0"
                      title={row.pool_id}
                    >
                      {truncatePoolId(row.pool_id)}
                    </span>
                    <span
                      className="text-[9px] font-mono text-[var(--color-text-muted)] shrink-0"
                      title={`captured=${row.coverage_summary.captured} · empty=${row.coverage_summary.empty_confirmed} · missing=${row.coverage_summary.missing} · failed=${row.coverage_summary.failed}`}
                    >
                      ✓{row.coverage_summary.captured} · ∅
                      {row.coverage_summary.empty_confirmed} · ?
                      {row.coverage_summary.missing} · ✗
                      {row.coverage_summary.failed}
                    </span>
                  </div>
                  <div className="flex flex-wrap gap-1">
                    {Object.entries(row.coverage).map(([dataType, state]) => (
                      <CoverageBadge
                        key={dataType}
                        dataType={dataType}
                        state={state}
                      />
                    ))}
                  </div>
                </div>
              ))}
            </div>
            {response.pools.length > MAX_VISIBLE_POOLS && (
              <div
                className="text-[10px] text-[var(--color-text-muted)] italic text-center pt-1"
                data-testid="defi-pools-truncation-footer"
              >
                + {response.pools.length - MAX_VISIBLE_POOLS} more pools
                (showing first {MAX_VISIBLE_POOLS})
              </div>
            )}
          </>
        )}
      </div>
    </ModalShell>
  );
}
