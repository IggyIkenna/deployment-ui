/**
 * RecursiveBorrowDrilldown — per-protocol coverage % bars + spread sparkline.
 *
 * Phase 11 of defi_recursive_borrow_archetypes_2026_05_10.md.
 *
 * Shows:
 *   - Per-protocol aggregated lending-rate coverage % (progress bar)
 *   - Per-collateral spread-history sparkline (last 30d placeholder)
 *   - Click → modal with cell-level config + backtest verdict stub
 *
 * Data sourced from GET /api/data-status/recursive-borrow-coverage (same
 * endpoint as ArchetypeMatrix). Shares the 60s polling cadence.
 */

import type { ReactElement } from "react";
import { useCallback, useEffect, useState } from "react";
import {
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
} from "recharts";

import {
  getRecursiveBorrowCoverage,
  type RecursiveBorrowCell,
  type RecursiveBorrowCoverageResponse,
} from "../../../api/client";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function groupByProtocol(
  cells: RecursiveBorrowCell[],
): Map<string, RecursiveBorrowCell[]> {
  const map = new Map<string, RecursiveBorrowCell[]>();
  for (const c of cells) {
    const group = map.get(c.protocol) ?? [];
    group.push(c);
    map.set(c.protocol, group);
  }
  return map;
}

function avgCoverage(cells: RecursiveBorrowCell[]): number {
  if (!cells.length) return 0;
  return cells.reduce((s, c) => s + c.lending_rate_coverage_pct, 0) / cells.length;
}

function mockSparkline(): { d: number; spread: number }[] {
  let v = 0.5;
  return Array.from({ length: 30 }, (_, i) => {
    v = Math.max(0, Math.min(2, v + (Math.random() - 0.5) * 0.15));
    return { d: i, spread: parseFloat(v.toFixed(3)) };
  });
}

// ---------------------------------------------------------------------------
// Protocol row
// ---------------------------------------------------------------------------
function ProtocolRow({
  protocol,
  cells,
  onCellClick,
}: {
  protocol: string;
  cells: RecursiveBorrowCell[];
  onCellClick: (cell: RecursiveBorrowCell) => void;
}): ReactElement {
  const avg = avgCoverage(cells);
  const sparkData = mockSparkline();

  return (
    <div className="border-b border-[var(--color-border-default)] px-4 py-3 last:border-0">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <span className="w-20 text-sm font-medium text-[var(--color-text-primary)]">{protocol}</span>
          <div className="h-2 w-32 overflow-hidden rounded-full bg-[var(--color-bg-tertiary)]">
            <div
              className="h-full rounded-full bg-blue-500 transition-all"
              style={{ width: `${Math.min(100, avg)}%` }}
            />
          </div>
          <span className="text-xs text-[var(--color-text-muted)]">{avg.toFixed(1)}%</span>
        </div>
        <div className="h-8 w-24">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={sparkData}>
              <Line
                type="monotone"
                dataKey="spread"
                stroke="#6366f1"
                dot={false}
                strokeWidth={1}
                isAnimationActive={false}
              />
              <Tooltip
                contentStyle={{ fontSize: 10 }}
                formatter={(v) => [typeof v === "number" ? `${v.toFixed(3)}%` : String(v), "spread"]}
              />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </div>
      <div className="mt-2 flex flex-wrap gap-1">
        {cells.map((c, i) => (
          <button
            key={i}
            onClick={() => onCellClick(c)}
            className="rounded bg-[var(--color-bg-secondary)] px-2 py-0.5 text-xs text-[var(--color-text-secondary)] hover:bg-[var(--color-bg-tertiary)]"
          >
            {c.collateral_asset}/{c.debt_asset}
            {c.perp_venue ? ` · ${c.perp_venue}` : ""}
          </button>
        ))}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Cell detail modal
// ---------------------------------------------------------------------------
function CellModal({
  cell,
  onClose,
}: {
  cell: RecursiveBorrowCell;
  onClose: () => void;
}): ReactElement {
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40"
      onClick={onClose}
    >
      <div
        className="w-full max-w-md rounded-xl bg-[var(--color-bg-elevated)] p-6 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-4 flex items-start justify-between">
          <h2 className="text-base font-semibold text-[var(--color-text-primary)]">
            {cell.protocol} · {cell.collateral_asset}/{cell.debt_asset}
          </h2>
          <button
            onClick={onClose}
            className="text-[var(--color-text-muted)] hover:text-[var(--color-text-secondary)]"
          >
            ✕
          </button>
        </div>
        <dl className="space-y-2 text-sm">
          {(
            [
              ["Family", cell.family],
              ["Chain", cell.chain],
              ["Perp venue", cell.perp_venue ?? "—"],
              ["Lending cov %", `${cell.lending_rate_coverage_pct.toFixed(1)}%`],
              ["Funding cov %", `${cell.funding_rate_coverage_pct.toFixed(1)}%`],
              ["Spread horizon", `${cell.spread_history_horizon_days}d`],
              ["Cell status", cell.cell_status],
              ["Last observed", cell.last_observed_at ?? "—"],
            ] as [string, string][]
          ).map(([label, value]) => (
            <div key={label} className="flex justify-between">
              <dt className="text-[var(--color-text-muted)]">{label}</dt>
              <dd className="font-mono text-[var(--color-text-primary)]">{value}</dd>
            </div>
          ))}
        </dl>
        <p className="mt-4 rounded bg-[var(--color-bg-secondary)] p-2 text-xs text-[var(--color-text-muted)]">
          Backtest verdict: pending Phase 9 backtest replay (BLOCKED-DATA until 2026-05-19).
        </p>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------
export function RecursiveBorrowDrilldown(): ReactElement {
  const [data, setData] = useState<RecursiveBorrowCoverageResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [selectedCell, setSelectedCell] = useState<RecursiveBorrowCell | null>(null);

  const fetchData = useCallback(async () => {
    try {
      const resp = await getRecursiveBorrowCoverage();
      setData(resp);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to fetch");
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
    return <div className="p-4 text-sm text-[var(--color-text-muted)]">Loading drilldown…</div>;
  }
  if (error) {
    return <div className="p-4 text-sm text-[var(--color-accent-red)]">Error: {error}</div>;
  }
  if (!data) {
    return <div className="p-4 text-sm text-[var(--color-text-muted)]">No data</div>;
  }

  const grouped = groupByProtocol(data.cells);

  return (
    <div className="rounded-lg border border-[var(--color-border-default)] bg-[var(--color-bg-elevated)] shadow-sm">
      <div className="border-b border-[var(--color-border-default)] px-4 py-3">
        <h3 className="text-sm font-semibold text-[var(--color-text-primary)]">
          Recursive-Borrow Drilldown
          <span className="ml-2 text-xs font-normal text-[var(--color-text-muted)]">
            Spread sparkline = last 30d (mock until backtest data lands)
          </span>
        </h3>
      </div>
      <div>
        {[...grouped.entries()].map(([protocol, cells]) => (
          <ProtocolRow
            key={protocol}
            protocol={protocol}
            cells={cells}
            onCellClick={setSelectedCell}
          />
        ))}
      </div>
      {selectedCell && (
        <CellModal cell={selectedCell} onClose={() => setSelectedCell(null)} />
      )}
    </div>
  );
}
