/**
 * HealthFactorMonitorTile — live HF chart for recursive-borrow positions.
 *
 * Phase 11 of defi_recursive_borrow_archetypes_2026_05_10.md.
 *
 * Renders a LineChart with two ReferenceLine thresholds:
 *   1.10 → yellow (HEALTH_FACTOR_CRITICAL — partial unwind trigger)
 *   1.05 → red   (LIQUIDATION_IMMINENT — flash-close trigger)
 *
 * UI-throttled to update at most every 5 s regardless of on-chain block rate
 * (Ethereum 12s / Base 2s / Arbitrum 250ms). Wires into KillSwitchPanel
 * ARCHETYPE-scope kill-switches (per-position, NOT global).
 *
 * Data source: the deployment-api SSE stream at
 * GET /api/data-status/recursive-borrow-health-factors/stream (P1 sub-todo).
 * Until that endpoint lands, this component polls mock HF=1.25 + jitter.
 */

import type { ReactElement } from "react";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  CartesianGrid,
  Line,
  LineChart,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface HfDataPoint {
  ts: string;
  hf: number;
  chain: string;
}

interface Props {
  /** Chain to monitor. Defaults to all chains in aggregate view. */
  chain?: string;
  /** Polling interval in ms. Default 5000 (UI-throttle per plan). */
  pollIntervalMs?: number;
}

// ---------------------------------------------------------------------------
// Mock HF generator — removed when SSE endpoint lands.
// ---------------------------------------------------------------------------
let _mockHf = 1.25;
function _nextMockHf(): number {
  _mockHf = Math.max(
    1.01,
    Math.min(2.0, _mockHf + (Math.random() - 0.5) * 0.04),
  );
  return _mockHf;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------
export function HealthFactorMonitorTile({
  chain = "all",
  pollIntervalMs = 5_000,
}: Props): ReactElement {
  const [points, setPoints] = useState<HfDataPoint[]>([]);
  const lastUpdate = useRef<number>(0);

  const tick = useCallback(() => {
    const now = Date.now();
    if (now - lastUpdate.current < pollIntervalMs) return;
    lastUpdate.current = now;
    const ts = new Date().toISOString().slice(11, 19);
    setPoints((prev) => {
      const next = [...prev, { ts, hf: _nextMockHf(), chain }];
      return next.length > 60 ? next.slice(-60) : next;
    });
  }, [chain, pollIntervalMs]);

  useEffect(() => {
    const id = setInterval(tick, pollIntervalMs);
    tick();
    return () => clearInterval(id);
  }, [tick, pollIntervalMs]);

  const latest = points[points.length - 1];
  const hfColor =
    latest && latest.hf < 1.05
      ? "text-[var(--color-accent-red)]"
      : latest && latest.hf < 1.1
        ? "text-[var(--color-accent-amber)]"
        : "text-[var(--color-accent-green)]";

  return (
    <div className="rounded-lg border border-[var(--color-border-default)] bg-[var(--color-bg-elevated)] p-4 shadow-sm">
      <div className="mb-3 flex items-center justify-between">
        <h3 className="text-sm font-semibold text-[var(--color-text-primary)]">
          Health Factor Monitor
          <span className="ml-2 text-xs font-normal text-[var(--color-text-muted)]">
            chain: {chain}
          </span>
        </h3>
        {latest && (
          <span className={`text-lg font-bold tabular-nums ${hfColor}`}>
            HF {latest.hf.toFixed(3)}
          </span>
        )}
      </div>

      <ResponsiveContainer width="100%" height={160}>
        <LineChart
          data={points}
          margin={{ top: 4, right: 8, bottom: 4, left: 0 }}
        >
          <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
          <XAxis
            dataKey="ts"
            tick={{ fontSize: 10 }}
            interval="preserveStartEnd"
          />
          <YAxis
            domain={[1.0, 2.0]}
            tick={{ fontSize: 10 }}
            tickFormatter={(v: number) => v.toFixed(2)}
          />
          <Tooltip
            formatter={(v) =>
              typeof v === "number" ? v.toFixed(3) : String(v)
            }
          />
          <ReferenceLine
            y={1.1}
            stroke="#eab308"
            strokeDasharray="4 2"
            label={{ value: "1.10", fontSize: 10, fill: "#eab308" }}
          />
          <ReferenceLine
            y={1.05}
            stroke="#dc2626"
            strokeDasharray="4 2"
            label={{ value: "1.05", fontSize: 10, fill: "#dc2626" }}
          />
          <Line
            type="monotone"
            dataKey="hf"
            stroke="#3b82f6"
            dot={false}
            strokeWidth={1.5}
            isAnimationActive={false}
          />
        </LineChart>
      </ResponsiveContainer>

      <p className="mt-2 text-xs text-[var(--color-text-muted)]">
        Thresholds: 1.10 partial-unwind (yellow) · 1.05 flash-close (red).
        UI-throttled {pollIntervalMs / 1000}s. SSE stream endpoint pending
        (Phase 11 P1 sub-todo).
      </p>
    </div>
  );
}
