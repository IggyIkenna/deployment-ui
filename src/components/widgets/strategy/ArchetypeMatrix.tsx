/**
 * ArchetypeMatrix — 17-cell recursive-borrow coverage grid.
 *
 * Phase 11 of defi_recursive_borrow_archetypes_2026_05_10.md.
 *
 * Displays 7 Family-1 (lending-only) + 10 Family-2 (perp-hedged) cells keyed
 * by (protocol, chain, collateral, debt, perp_venue?). Per-cell badge:
 *   design-ready   → grey
 *   coverage-ready → blue
 *   live-ready     → green
 *   paused         → yellow
 *
 * Polls the deployment-api every 60 s (matching server-side cache TTL).
 */

import type { ReactElement } from "react";
import { useCallback, useEffect, useState } from "react";

import {
  getRecursiveBorrowCoverage,
  type RecursiveBorrowCell,
  type RecursiveBorrowCoverageResponse,
} from "../../../api/client";

// ---------------------------------------------------------------------------
// Badge colours
// ---------------------------------------------------------------------------
const _STATUS_CLASSES: Record<RecursiveBorrowCell["cell_status"], string> = {
  "design-ready":
    "bg-[var(--color-bg-secondary)] text-[var(--color-text-secondary)]",
  "coverage-ready":
    "bg-[var(--color-status-info-bg)] text-[var(--color-accent-blue)]",
  "live-ready":
    "bg-[var(--color-status-success-bg)] text-[var(--color-accent-green)]",
  paused:
    "bg-[var(--color-status-warning-bg)] text-[var(--color-accent-amber)]",
};

function StatusBadge({
  status,
}: {
  status: RecursiveBorrowCell["cell_status"];
}): ReactElement {
  return (
    <span
      className={`inline-block rounded px-1.5 py-0.5 text-xs font-medium ${_STATUS_CLASSES[status]}`}
    >
      {status}
    </span>
  );
}

// ---------------------------------------------------------------------------
// Cell row
// ---------------------------------------------------------------------------
function CellRow({ cell }: { cell: RecursiveBorrowCell }): ReactElement {
  const family = cell.family === "perp-hedged" ? "F2" : "F1";
  return (
    <tr className="border-b border-[var(--color-border-default)] hover:bg-[var(--color-bg-secondary)]">
      <td className="px-3 py-2 text-xs font-mono text-[var(--color-text-muted)]">
        {family}
      </td>
      <td className="px-3 py-2 text-xs">{cell.protocol}</td>
      <td className="px-3 py-2 text-xs">{cell.chain}</td>
      <td className="px-3 py-2 text-xs">{cell.collateral_asset}</td>
      <td className="px-3 py-2 text-xs">{cell.debt_asset}</td>
      <td className="px-3 py-2 text-xs">{cell.perp_venue ?? "—"}</td>
      <td className="px-3 py-2 text-right text-xs">
        {cell.lending_rate_coverage_pct.toFixed(1)}%
      </td>
      <td className="px-3 py-2">
        <StatusBadge status={cell.cell_status} />
      </td>
    </tr>
  );
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------
export function ArchetypeMatrix(): ReactElement {
  const [data, setData] = useState<RecursiveBorrowCoverageResponse | null>(
    null,
  );
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const fetchData = useCallback(async () => {
    try {
      const resp = await getRecursiveBorrowCoverage();
      setData(resp);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to fetch coverage");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void fetchData();
    const interval = setInterval(() => void fetchData(), 60_000);
    return () => clearInterval(interval);
  }, [fetchData]);

  if (loading) {
    return (
      <div className="p-4 text-sm text-[var(--color-text-muted)]">
        Loading archetype matrix…
      </div>
    );
  }
  if (error) {
    return (
      <div className="p-4 text-sm text-[var(--color-accent-red)]">
        Error: {error}
      </div>
    );
  }
  if (!data) {
    return (
      <div className="p-4 text-sm text-[var(--color-text-muted)]">No data</div>
    );
  }

  const { cells, summary } = data;

  return (
    <div className="rounded-lg border border-[var(--color-border-default)] bg-[var(--color-bg-elevated)] shadow-sm">
      <div className="flex items-center justify-between border-b border-[var(--color-border-default)] px-4 py-3">
        <h3 className="text-sm font-semibold text-[var(--color-text-primary)]">
          Recursive-Borrow Cell Coverage
          <span className="ml-2 text-xs font-normal text-[var(--color-text-muted)]">
            ({summary.total_cells} cells · {summary.live_ready} live-ready)
          </span>
        </h3>
        <span className="text-xs text-[var(--color-text-muted)]">
          Refreshes every 60s
        </span>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-left">
          <thead>
            <tr className="border-b border-[var(--color-border-default)] bg-[var(--color-bg-secondary)] text-xs text-[var(--color-text-secondary)]">
              <th className="px-3 py-2">Fam</th>
              <th className="px-3 py-2">Protocol</th>
              <th className="px-3 py-2">Chain</th>
              <th className="px-3 py-2">Collateral</th>
              <th className="px-3 py-2">Debt</th>
              <th className="px-3 py-2">Perp venue</th>
              <th className="px-3 py-2 text-right">Lend cov%</th>
              <th className="px-3 py-2">Status</th>
            </tr>
          </thead>
          <tbody>
            {cells.map((cell, i) => (
              <CellRow key={i} cell={cell} />
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
